-- A rehearsal reset is destructive runtime maintenance, so require an external
-- export confirmation, an exact phrase, closed public controls, and an idempotency key.
create table if not exists rehearsal_resets (
  id bigint generated always as identity primary key,
  event_key uuid not null unique,
  actor text not null check (char_length(actor) between 1 and 200),
  reason text not null check (char_length(trim(reason)) between 3 and 300),
  summary jsonb not null,
  evidence_paths text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table rehearsal_resets enable row level security;
revoke all on rehearsal_resets from public, anon, authenticated;

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

create or replace function reset_rehearsal_data(
  p_confirmation text,
  p_backup_confirmed boolean,
  p_reason text,
  p_event_key uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_existing rehearsal_resets%rowtype;
  v_summary jsonb;
  v_evidence_paths text[];
begin
  if p_event_key is null then raise exception using errcode='22023',message='reset_event_key_required'; end if;
  select * into v_existing from rehearsal_resets where event_key=p_event_key;
  if found then return v_existing.summary; end if;
  if p_confirmation<>'RESET WEDDING' then raise exception using errcode='22023',message='reset_confirmation_invalid'; end if;
  if not coalesce(p_backup_confirmed,false) then raise exception using errcode='22023',message='reset_backup_required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception using errcode='22023',message='reset_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'));
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.registration_open or v_state.voting_open or v_state.scoreboard_visible then
    raise exception using errcode='P0001',message='reset_public_controls_open';
  end if;

  v_summary:=preview_rehearsal_reset();
  select coalesce(array_agg(evidence_path order by evidence_path),'{}'::text[])
  into v_evidence_paths from assignments where evidence_path is not null;

  -- Keep issued card hashes so already printed physical cards remain valid, but
  -- release all rehearsal claims before deleting their assignment records.
  update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null
  where claimed_by is not null or claimed_at is not null or assignment_id is not null;

  delete from result_rewards;
  delete from votes;
  delete from guest_clues;
  delete from points_ledger;
  delete from team_points_ledger;
  delete from spy_points_ledger;
  delete from team_resource_ledger;
  delete from assignments;
  delete from guest_sessions;
  delete from guest_login_throttles;

  update team_resources set balance=10,updated_at=now();
  update awards set winner_guest_id=null,winner_team=null,reason='',published=false,updated_at=now();
  update guests set
    team=case when team_locked then team else '未分组' end,
    role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end,
    is_hidden_spy=false,
    points=0,
    claim_code_hash=null,
    claimed_at=null,
    drawn_at=null;
  update game_state set
    registration_open=false,stage='registration',voting_open=false,voting_round=0,
    results_visible=false,scoreboard_visible=false,phase_note=null,
    display_title=null,display_body=null,public_clue=null,timer_ends_at=null,
    current_host_segment_id=null,voting_opened_at=null,voting_closed_at=null,
    results_published_at=null,updated_at=now()
  where id=1;

  insert into rehearsal_resets(event_key,actor,reason,summary,evidence_paths)
  values(p_event_key,p_actor,trim(p_reason),v_summary,v_evidence_paths);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'rehearsal.reset','game_state','1',
    jsonb_build_object('reason',trim(p_reason),'backup_confirmed',true,'summary',v_summary));
  return v_summary;
end;
$$;

revoke all on function preview_rehearsal_reset() from public, anon, authenticated;
revoke all on function reset_rehearsal_data(text,boolean,text,uuid,text) from public, anon, authenticated;
grant execute on function preview_rehearsal_reset() to service_role;
grant execute on function reset_rehearsal_data(text,boolean,text,uuid,text) to service_role;
