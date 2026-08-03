-- Guest avatars are rehearsal runtime data. Capture their private storage paths
-- in the reset record, then clear the database pointers in the same transaction.
-- The application removes the captured objects after commit and can retry from
-- the durable reset record if Storage is temporarily unavailable.

alter table rehearsal_resets
  add column if not exists avatar_paths text[] not null default '{}'::text[];

create or replace function preview_rehearsal_reset()
returns jsonb
language sql
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'claimed_guests',(select count(*) from guests where claimed_at is not null),
    'drawn_guests',(select count(*) from guests where drawn_at is not null),
    'assignments',(select count(*) from assignments),
    'evidence_files',(select count(*) from assignments where evidence_path is not null),
    'avatar_files',(select count(*) from guests where avatar_path is not null),
    'votes',(select count(*) from votes),
    'guest_clues',(select count(*) from guest_clues),
    'personal_ledger_entries',(select count(*) from points_ledger),
    'team_ledger_entries',(select count(*) from team_points_ledger),
    'spy_ledger_entries',(select count(*) from spy_points_ledger),
    'resource_ledger_entries',(select count(*) from team_resource_ledger),
    'registration_open',coalesce((select registration_open from game_state where id=1),false),
    'voting_open',coalesce((select voting_open from game_state where id=1),false),
    'scoreboard_visible',coalesce((select scoreboard_visible from game_state where id=1),false)
  );
$$;

create or replace function capture_rehearsal_avatar_cleanup()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  select coalesce(array_agg(avatar_path order by avatar_path),'{}'::text[])
  into new.avatar_paths
  from guests
  where avatar_path is not null;

  update guests
  set avatar_path=null,avatar_uploaded_at=null
  where avatar_path is not null;

  return new;
end;
$$;

drop trigger if exists capture_rehearsal_avatar_cleanup on rehearsal_resets;
create trigger capture_rehearsal_avatar_cleanup
before insert on rehearsal_resets
for each row execute function capture_rehearsal_avatar_cleanup();

-- Repair avatars that survived the most recent reset performed after the avatar
-- feature shipped. A genuinely new selfie has a timestamp after that reset and
-- is deliberately preserved.
do $$
declare
  v_reset_id bigint;
  v_reset_at timestamptz;
  v_paths text[];
begin
  select id,created_at into v_reset_id,v_reset_at
  from rehearsal_resets
  order by created_at desc,id desc
  limit 1;

  if v_reset_id is null then return; end if;

  select coalesce(array_agg(avatar_path order by avatar_path),'{}'::text[])
  into v_paths
  from guests
  where avatar_path is not null
    and (avatar_uploaded_at is null or avatar_uploaded_at<=v_reset_at);

  if cardinality(v_paths)>0 then
    update rehearsal_resets
    set avatar_paths=(
      select array_agg(distinct path order by path)
      from unnest(avatar_paths||v_paths) as path
    )
    where id=v_reset_id;

    update guests
    set avatar_path=null,avatar_uploaded_at=null
    where avatar_path=any(v_paths);
  end if;
end;
$$;

revoke all on function capture_rehearsal_avatar_cleanup() from public,anon,authenticated;
revoke all on function preview_rehearsal_reset() from public,anon,authenticated;
grant execute on function preview_rehearsal_reset() to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608030001','rehearsal.avatar_cleanup_added','rehearsal_resets','all',
  jsonb_build_object('forward_only',true,'stale_avatar_links_repaired',true));
