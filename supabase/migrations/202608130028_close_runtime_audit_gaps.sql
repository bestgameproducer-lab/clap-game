-- Close the final mutation gaps found by the full data-lifecycle and
-- UI -> route -> RPC audit.  This migration is deliberately forward-only:
-- it does not reset, seed, or rewrite production runtime data.

begin;

-- The canonical approval function is an implementation detail.  Application
-- code must use approve_assignment_with_verification_for_run so a delayed
-- request from an older rehearsal cannot score the current wedding.
revoke all on function approve_assignment(uuid,text,text)
  from public,anon,authenticated,service_role;

-- Staff evidence follows the same act windows as guest submission and task-
-- station completion.  Put the rule in each canonical function so a stale tab,
-- a replayed signed-upload confirmation, or a direct service call cannot
-- bypass the buttons hidden by the station UI.
create or replace function assert_staff_assignment_evidence_open(
  p_assignment_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest_id uuid;
  v_status text;
  v_task_stage text;
  v_task_category text;
  v_game_stage text;
  v_results_published_at timestamptz;
  v_claimed_at timestamptz;
begin
  select a.guest_id,a.status,t.stage,t.category,s.stage,
    s.results_published_at,g.claimed_at
  into v_guest_id,v_status,v_task_stage,v_task_category,v_game_stage,
    v_results_published_at,v_claimed_at
  from assignments a
  join tasks t on t.id=a.task_id
  join guests g on g.id=a.guest_id
  cross join game_state s
  where a.id=p_assignment_id and s.id=1 and g.active and g.uses_app
  for share of a,t,g,s;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='assignment_guest_not_claimed';
  end if;
  if v_status not in('assigned','rejected','submitted') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;
  if v_task_category='hidden' then
    raise exception using errcode='P0001',message='hidden_assignment_evidence_forbidden';
  end if;
  if (v_task_stage='task_round_1' and not phase_one_interactions_open(v_game_stage))
      or (v_task_stage='task_round_2' and v_game_stage not in('task_round_2','banquet','group_game'))
      or (v_task_stage='group_game' and v_game_stage<>'group_game')
      or v_task_stage not in('task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;
  return v_guest_id;
end;
$$;

create or replace function authorize_staff_assignment_evidence_upload(
  p_assignment_id uuid
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_guest_id uuid;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_run_id from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  v_guest_id:=assert_staff_assignment_evidence_open(p_assignment_id);
  return v_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
end;
$$;

create or replace function confirm_assignment_evidence_staff(
  p_assignment_id uuid,p_evidence_path text,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_guest_id uuid;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_run_id from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  v_guest_id:=assert_staff_assignment_evidence_open(p_assignment_id);
  v_expected_path:=v_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
  if p_evidence_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then
    raise exception using errcode='P0002',message='evidence_object_missing';
  end if;
  update assignments set evidence_path=v_expected_path,
    evidence_uploaded_at=v_uploaded_at where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence_confirm','assignment',p_assignment_id::text,
    jsonb_build_object('uploaded_at',v_uploaded_at,'run_scoped_path',true));
end;
$$;

create or replace function clear_assignment_evidence_staff(
  p_assignment_id uuid,p_actor text
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_path text;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  perform assert_staff_assignment_evidence_open(p_assignment_id);
  select evidence_path into v_path from assignments
    where id=p_assignment_id for update;
  update assignments set evidence_path=null,evidence_uploaded_at=null
    where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence_clear','assignment',p_assignment_id::text,
    jsonb_build_object('had_evidence',v_path is not null));
  return v_path;
end;
$$;

revoke all on function assert_staff_assignment_evidence_open(uuid)
  from public,anon,authenticated,service_role;
revoke all on function authorize_staff_assignment_evidence_upload(uuid)
  from public,anon,authenticated,service_role;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function clear_assignment_evidence_staff(uuid,text)
  from public,anon,authenticated,service_role;

-- A reset rotates rehearsal_run_id.  If the first response is lost, an exact
-- retry must return the recorded summary before the old-run rejection.  A
-- reused event key with different actor/reason/confirmation is a conflict.
create or replace function reset_rehearsal_data_for_run(
  p_confirmation text,p_backup_confirmed boolean,p_reason text,p_event_key uuid,
  p_actor text,p_rehearsal_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing rehearsal_resets%rowtype;
begin
  if p_event_key is null then
    raise exception using errcode='22023',message='reset_event_key_required';
  end if;
  perform pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'));
  select * into v_existing from rehearsal_resets where event_key=p_event_key;
  if found then
    if v_existing.actor is distinct from p_actor
        or v_existing.reason is distinct from trim(coalesce(p_reason,''))
        or p_confirmation is distinct from 'RESET WEDDING'
        or not coalesce(p_backup_confirmed,false) then
      raise exception using errcode='P0001',message='reset_event_conflict';
    end if;
    return v_existing.summary;
  end if;
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return reset_rehearsal_data(
    p_confirmation,p_backup_confirmed,p_reason,p_event_key,p_actor
  );
end;
$$;

revoke all on function reset_rehearsal_data_for_run(text,boolean,text,uuid,text,uuid)
  from public,anon,authenticated;
grant execute on function reset_rehearsal_data_for_run(text,boolean,text,uuid,text,uuid)
  to service_role;

-- The run-scoped wrappers remain the only application entry points.
grant execute on function authorize_staff_assignment_evidence_upload_for_run(uuid,uuid)
  to service_role;
grant execute on function confirm_assignment_evidence_staff_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function clear_assignment_evidence_staff_for_run(uuid,text,uuid)
  to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130028','runtime.audit_gaps_closed','game_state','1',
  jsonb_build_object(
    'canonical_approval_revoked',true,
    'staff_evidence_stage_guarded',true,
    'hidden_evidence_forbidden',true,
    'reset_retry_idempotent_after_run_rotation',true
  ));

commit;
