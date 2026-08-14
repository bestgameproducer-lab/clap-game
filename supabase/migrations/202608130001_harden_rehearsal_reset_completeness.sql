-- Make the rehearsal boundary complete and observable. Runtime rows are cleared
-- explicitly, while reusable wedding configuration remains intact. Private
-- Storage cleanup is performed by the application after this transaction; the
-- reset record captures every object in the two dedicated runtime buckets so an
-- upload that succeeded before its database confirmation is not orphaned.

begin;

-- A signed upload URL can outlive the guest session that requested it. Give
-- every rehearsal/formal run its own immutable avatar namespace so a late
-- upload from the old run can never overwrite the new formal selfie.
alter table game_state
  add column if not exists rehearsal_run_id uuid not null default gen_random_uuid();

alter table guests drop constraint if exists guests_avatar_path_check;
alter table guests add constraint guests_avatar_path_check check (
  avatar_path is null or (
    length(avatar_path)<=80
    and avatar_path ~ '^[0-9a-f-]{36}/(avatar|[0-9a-f-]{36})[.]jpg$'
  )
);

-- Evidence uploads use the same run namespace as avatars. Keep the historical
-- guest/assignment.jpg shape valid for already-approved production rows; every
-- new confirmation below still requires guest/run/assignment.jpg exactly.
alter table assignments drop constraint if exists assignments_evidence_path_check;
alter table assignments add constraint assignments_evidence_path_check check (
  evidence_path is null or (
    length(evidence_path)<=140
    and evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(evidence|[0-9a-f-]{36})[.]jpg$'
  )
);

create or replace function confirm_guest_avatar(
  p_guest_id uuid,
  p_avatar_path text
) returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  v_rehearsal_run_id uuid;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  perform 1 from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='avatar_guest_not_found'; end if;

  select rehearsal_run_id into v_rehearsal_run_id from game_state where id=1;
  if v_rehearsal_run_id is null then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  v_expected_path:=p_guest_id::text||'/'||v_rehearsal_run_id::text||'.jpg';
  if p_avatar_path<>v_expected_path then
    raise exception using errcode='22023',message='invalid_avatar_path';
  end if;

  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='guest-avatars' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='avatar_object_missing'; end if;
  update guests set avatar_path=v_expected_path,avatar_uploaded_at=v_uploaded_at where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'guest.avatar_confirm','guest',p_guest_id::text,
    jsonb_build_object('uploaded_at',v_uploaded_at,'run_scoped_path',true));
  return v_uploaded_at;
end;
$$;

create or replace function confirm_assignment_evidence(
  p_assignment_id uuid,
  p_guest_id uuid,
  p_evidence_path text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  perform 1 from assignments
  where id=p_assignment_id and guest_id=p_guest_id and status in('assigned','rejected')
  for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;

  select rehearsal_run_id into v_run_id from game_state where id=1 for share;
  if v_run_id is null then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  v_expected_path:=p_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
  if p_evidence_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;

  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='evidence_object_missing'; end if;
  update assignments set evidence_path=v_expected_path,evidence_uploaded_at=v_uploaded_at
  where id=p_assignment_id;
end;
$$;

create or replace function confirm_assignment_evidence_staff(
  p_assignment_id uuid,
  p_evidence_path text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest_id uuid;
  v_run_id uuid;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;
  select guest_id into v_guest_id from assignments
  where id=p_assignment_id and status in('assigned','rejected','submitted') for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;

  select rehearsal_run_id into v_run_id from game_state where id=1 for share;
  if v_run_id is null then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  v_expected_path:=v_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
  if p_evidence_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;

  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='evidence_object_missing'; end if;
  update assignments set evidence_path=v_expected_path,evidence_uploaded_at=v_uploaded_at
  where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence_confirm','assignment',p_assignment_id::text,
    jsonb_build_object('uploaded_at',v_uploaded_at,'run_scoped_path',true));
end;
$$;

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
    'evidence_files',(select count(*) from storage.objects where bucket_id='task-evidence'),
    'avatar_files',(select count(*) from storage.objects where bucket_id='guest-avatars'),
    'votes',(select count(*) from votes),
    'result_rewards',(select count(*) from result_rewards),
    'guest_clues',(select count(*) from guest_clues),
    'clue_library_entries',(select count(*) from clues),
    'personal_ledger_entries',(select count(*) from points_ledger),
    'team_ledger_entries',(select count(*) from team_points_ledger),
    'spy_ledger_entries',(select count(*) from spy_points_ledger),
    'resource_ledger_entries',(select count(*) from team_resource_ledger),
    'mutual_confirmations',(select count(*) from assignment_mutual_confirmations),
    'symbol_pairings',(select count(*) from symbol_pairing_assignments),
    'helper_actions',(select count(*) from cupid_helper_actions),
    'player_relationships',(select count(*) from player_relationships),
    'trickster_attempts',(select count(*) from trickster_signal_attempts),
    'assigned_heart_slots',(select count(*) from heart_slots where guest_id is not null or assigned_at is not null),
    'phase_two_profiles',(select count(*) from phase_two_profiles),
    'phase_two_dilemmas',(select count(*) from phase_two_dilemmas),
    'phase_two_copy_choices',(select count(*) from phase_two_copy_choices),
    'guest_sessions',(select count(*) from guest_sessions),
    'published_awards',(select count(*) from awards where published or winner_guest_id is not null or winner_team is not null),
    'hidden_task_codes',(select count(*) from hidden_task_codes),
    'legacy_alliance_clue_fragments',(select count(*) from alliance_clue_fragments
      where active or title<>'' or left_fragment<>'' or right_fragment<>''),
    'pending_storage_cleanup_events',(select count(*) from rehearsal_resets
      where cardinality(evidence_paths)>0 or cardinality(avatar_paths)>0),
    'registration_open',coalesce((select registration_open from game_state where id=1),false),
    'voting_open',coalesce((select voting_open from game_state where id=1),false),
    'results_visible',coalesce((select results_visible from game_state where id=1),false),
    'scoreboard_visible',coalesce((select scoreboard_visible from game_state where id=1),false),
    'team_clues_settled',coalesce((select team_clues_settled_at is not null from game_state where id=1),false),
    'team_score_snapshotted',coalesce((select team_score_snapshot is not null from game_state where id=1),false)
  );
$$;

-- Capture bucket contents, rather than only guest rows that finished confirming
-- an upload. This trigger also clears all avatar pointers transactionally.
create or replace function capture_rehearsal_avatar_cleanup()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  select coalesce(array_agg(name order by name),'{}'::text[])
  into new.avatar_paths
  from storage.objects
  where bucket_id='guest-avatars';

  update guests
  set avatar_path=null,avatar_uploaded_at=null
  where avatar_path is not null or avatar_uploaded_at is not null;

  return new;
end;
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

  -- The idempotency lookup must happen under the same lock as the reset. Without
  -- this ordering, concurrent retries can both miss the event record.
  perform pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'));
  perform set_config('wedding.rehearsal_reset','on',true);
  select * into v_existing from rehearsal_resets where event_key=p_event_key;
  if found then return v_existing.summary; end if;

  -- A second reset must not overlap a failed Storage cleanup. Keep each run's
  -- private-object boundary complete; the run-scoped avatar namespace below is
  -- a second line of defence against late signed uploads.
  if exists(
    select 1 from rehearsal_resets
    where cardinality(evidence_paths)>0 or cardinality(avatar_paths)>0
  ) then
    raise exception using errcode='P0001',message='rehearsal_storage_cleanup_pending';
  end if;

  if p_confirmation<>'RESET WEDDING' then raise exception using errcode='22023',message='reset_confirmation_invalid'; end if;
  if not coalesce(p_backup_confirmed,false) then raise exception using errcode='22023',message='reset_backup_required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception using errcode='22023',message='reset_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  v_summary:=preview_rehearsal_reset();
  select coalesce(array_agg(name order by name),'{}'::text[])
  into v_evidence_paths
  from storage.objects
  where bucket_id='task-evidence';

  update game_state set
    registration_open=false,voting_open=false,scoreboard_visible=false,
    results_visible=false,rehearsal_run_id=gen_random_uuid(),updated_at=now()
  where id=1;

  delete from hidden_task_codes where true;

  delete from cupid_helper_actions where true;
  delete from assignment_mutual_confirmations where true;
  delete from symbol_pairing_assignments where true;
  delete from player_relationships where true;
  delete from trickster_signal_attempts where true;
  delete from phase_two_dilemmas where true;
  delete from phase_two_copy_choices where true;
  delete from phase_two_profiles where true;
  update heart_slots set guest_id=null,assigned_at=null where true;

  delete from result_rewards where true;
  delete from votes where true;
  delete from guest_clues where true;
  delete from points_ledger where true;
  delete from team_points_ledger where true;
  delete from spy_points_ledger where true;
  delete from team_resource_ledger where true;
  delete from assignments where true;
  delete from clues where true;
  update alliance_clue_fragments set
    title='丘比特联盟共享线索',left_fragment='',right_fragment='',active=false,updated_at=now()
  where true;
  delete from guest_sessions where true;
  delete from guest_login_throttles where true;
  delete from player_code_attempt_throttles where true;

  update team_resources set balance=10,updated_at=now() where true;
  update awards set winner_guest_id=null,winner_team=null,reason='',published=false,updated_at=now() where true;
  update guests set
    team=case when team_locked then team else '未分组' end,
    role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end,
    story_role=case when role_locked then story_role else 'NONE' end,
    ceremony_eligible=case when role_locked then ceremony_eligible else false end,
    is_hidden_spy=false,hidden_role='NONE',unlocked_role='NONE',special_card_revealed_at=null,
    points=0,login_code=null,claim_code_hash=null,claimed_at=null,drawn_at=null,
    player_code=generate_readable_player_code()
  where true;
  update game_state set
    registration_open=false,stage='registration',voting_open=false,voting_round=0,
    results_visible=false,scoreboard_visible=false,phase_note=null,
    display_title=null,display_body=null,public_clue=null,timer_ends_at=null,
    current_host_segment_id=null,voting_opened_at=null,voting_closed_at=null,
    results_published_at=null,phase_one_completed_at=null,
    team_clues_settled_at=null,team_score_snapshot=null,updated_at=now()
  where id=1;

  insert into rehearsal_resets(event_key,actor,reason,summary,evidence_paths)
  values(p_event_key,p_actor,trim(p_reason),v_summary,v_evidence_paths);

  -- AFTER INSERT reset triggers have run by this point. Fail the entire
  -- transaction instead of reporting success if any database runtime survived.
  if exists(select 1 from assignments)
    or exists(select 1 from cupid_helper_actions)
    or exists(select 1 from assignment_mutual_confirmations)
    or exists(select 1 from symbol_pairing_assignments)
    or exists(select 1 from player_relationships)
    or exists(select 1 from trickster_signal_attempts)
    or exists(select 1 from phase_two_dilemmas)
    or exists(select 1 from phase_two_copy_choices)
    or exists(select 1 from phase_two_profiles)
    or exists(select 1 from result_rewards)
    or exists(select 1 from votes)
    or exists(select 1 from guest_clues)
    or exists(select 1 from clues)
    or exists(select 1 from points_ledger)
    or exists(select 1 from team_points_ledger)
    or exists(select 1 from spy_points_ledger)
    or exists(select 1 from team_resource_ledger)
    or exists(select 1 from guest_sessions)
    or exists(select 1 from guest_login_throttles)
    or exists(select 1 from player_code_attempt_throttles)
    or exists(select 1 from hidden_task_codes)
    or exists(select 1 from alliance_clue_fragments
      where active or left_fragment<>'' or right_fragment<>'')
    or exists(select 1 from heart_slots where guest_id is not null or assigned_at is not null)
    or exists(select 1 from guests where login_code is not null or claim_code_hash is not null or claimed_at is not null or drawn_at is not null
      or avatar_path is not null or avatar_uploaded_at is not null or points<>0 or is_hidden_spy
      or hidden_role<>'NONE' or unlocked_role<>'NONE' or special_card_revealed_at is not null
      or player_code is null
      or (not team_locked and team<>'未分组')
      or (not role_locked and (role<>'guest' or story_role<>'NONE' or ceremony_eligible)))
    or exists(select 1 from team_resources where balance<>10)
    or exists(select 1 from awards where winner_guest_id is not null or winner_team is not null or reason<>'' or published)
    or exists(select 1 from game_state where id=1 and (
      registration_open or stage<>'registration' or voting_open or voting_round<>0 or results_visible or scoreboard_visible
      or phase_note is not null or display_title is not null or display_body is not null or public_clue is not null
      or timer_ends_at is not null or current_host_segment_id is not null or voting_opened_at is not null
      or voting_closed_at is not null or results_published_at is not null or phase_one_completed_at is not null
      or team_clues_settled_at is not null or team_score_snapshot is not null
      or rehearsal_run_id=v_state.rehearsal_run_id
    )) then
    raise exception using errcode='P0001',message='reset_postcondition_failed';
  end if;

  v_summary:=v_summary||jsonb_build_object('database_postconditions_passed',true);
  update rehearsal_resets set summary=v_summary where event_key=p_event_key;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'rehearsal.reset','game_state','1',
    jsonb_build_object(
      'reason',trim(p_reason),'backup_confirmed',true,
      'clue_library_cleared',true,'legacy_clue_fragments_neutralized',true,
      'hidden_task_codes_cleared',true,'database_postconditions_passed',true,
      'public_controls_closed_automatically',
        (v_state.registration_open or v_state.voting_open or v_state.results_visible or v_state.scoreboard_visible),
      'summary',v_summary
    ));
  return v_summary;
end;
$$;

-- Current-run objects are legitimate: registration can be closed and reopened
-- after guests have already uploaded selfies or evidence. Only a durable
-- cleanup backlog or an object outside the current run namespace is unsafe.
create or replace function rehearsal_storage_namespace_clean(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select p_run_id is not null
    and not exists(
      select 1
      from storage.objects o
      where o.bucket_id in('task-evidence','guest-avatars')
        and case o.bucket_id
          when 'guest-avatars' then
            o.name !~ ('^[0-9a-f-]{36}/'||p_run_id::text||'[.]jpg$')
          when 'task-evidence' then
            o.name !~ ('^[0-9a-f-]{36}/'||p_run_id::text||'/[0-9a-f-]{36}[.]jpg$')
          else true
        end
    );
$$;

-- The database reset commits before private Storage deletion. Keep only the
-- false -> true registration path closed until pending cleanup is finished and
-- every remaining object belongs to this run.
create or replace function guard_registration_until_rehearsal_storage_clean()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if not new.registration_open then return new; end if;
  if tg_op='UPDATE' and coalesce(old.registration_open,false) then return new; end if;

  if exists(
    select 1 from rehearsal_resets
    where cardinality(evidence_paths)>0 or cardinality(avatar_paths)>0
  ) then
    raise exception using errcode='P0001',message='rehearsal_storage_cleanup_pending';
  end if;
  if not rehearsal_storage_namespace_clean(new.rehearsal_run_id) then
    raise exception using errcode='P0001',message='rehearsal_storage_cleanup_pending';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_registration_until_rehearsal_storage_clean on game_state;
create trigger guard_registration_until_rehearsal_storage_clean
before insert or update of registration_open on game_state
for each row execute function guard_registration_until_rehearsal_storage_clean();

revoke all on function preview_rehearsal_reset() from public,anon,authenticated;
revoke all on function capture_rehearsal_avatar_cleanup() from public,anon,authenticated;
revoke all on function confirm_guest_avatar(uuid,text) from public,anon,authenticated;
revoke all on function confirm_assignment_evidence(uuid,uuid,text) from public,anon,authenticated;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text) from public,anon,authenticated;
revoke all on function reset_rehearsal_data(text,boolean,text,uuid,text) from public,anon,authenticated;
revoke all on function guard_registration_until_rehearsal_storage_clean() from public,anon,authenticated;
revoke all on function rehearsal_storage_namespace_clean(uuid) from public,anon,authenticated;
grant execute on function preview_rehearsal_reset() to service_role;
grant execute on function confirm_guest_avatar(uuid,text) to service_role;
grant execute on function confirm_assignment_evidence(uuid,uuid,text) to service_role;
grant execute on function confirm_assignment_evidence_staff(uuid,text,text) to service_role;
grant execute on function reset_rehearsal_data(text,boolean,text,uuid,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130001','rehearsal.completeness_hardened','rehearsal_resets','all',
  jsonb_build_object(
    'forward_only',true,'storage_orphans_captured',true,'database_postconditions',true,
    'runtime_tables_explicit',true,'concurrent_idempotency_locked',true,
    'registration_blocked_until_storage_cleanup',true,'run_scoped_avatar_paths',true,
    'run_scoped_evidence_paths',true,'legacy_clue_fragments_neutralized',true,
    'physical_hidden_codes_retired',true));

commit;
