begin;

create or replace function sync_completed_trickster_vote_weight()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_is_completed_trickster boolean := false;
  v_updated integer := 0;
begin
  if new.status <> 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'approved' then return new; end if;
  end if;

  select exists(
    select 1
    from tasks t
    join guests g on g.id = new.guest_id
    where t.id = new.task_id
      and t.mission_code = 'P2-TRICKSTER-001'
      and g.role = 'spy'
  ) into v_is_completed_trickster;

  if not v_is_completed_trickster then
    return new;
  end if;

  update votes
  set vote_weight = 2
  where voter_guest_id = new.guest_id
    and vote_weight <> 2;
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(
      'system:trickster_vote_sync',
      'vote.weight_upgraded',
      'guest',
      new.guest_id::text,
      jsonb_build_object('assignment_id',new.id,'updated_ballots',v_updated,'vote_weight',2)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_trickster_vote_weight_sync on assignments;
create trigger assignment_trickster_vote_weight_sync
after insert or update of status on assignments
for each row execute function sync_completed_trickster_vote_weight();

with eligible_voters as (
  select distinct a.guest_id
  from assignments a
  join tasks t on t.id = a.task_id
  join guests g on g.id = a.guest_id
  where a.status = 'approved'
    and t.mission_code = 'P2-TRICKSTER-001'
    and g.role = 'spy'
  union
  select p.guest_id
  from phase_two_profiles p
  where p.primary_mission = 'EXTRA_VOTE'
    and p.unlocked_at is not null
)
update votes v
set vote_weight = 2
where v.voter_guest_id in (select guest_id from eligible_voters)
  and v.vote_weight <> 2;

revoke all on function sync_completed_trickster_vote_weight() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608030003',
  'trickster_double_vote_synchronized',
  'votes',
  'all_rounds',
  jsonb_build_object('completion_order_independent',true,'vote_weight',2,'existing_ballots_backfilled',true)
);

commit;
