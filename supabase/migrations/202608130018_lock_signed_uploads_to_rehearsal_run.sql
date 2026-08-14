-- Keep signed avatar/evidence uploads on one rehearsal snapshot.  Authorization
-- and confirmation both take the reset advisory lock in shared mode before
-- reading game, guest, or assignment state.  A concurrent rehearsal reset
-- therefore either happens wholly before the upload is authorized or wholly
-- after it; it can no longer splice an old assignment onto the new run path.

begin;

create or replace function authorize_guest_avatar_upload(
  p_guest_id uuid
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_results_published_at timestamptz;
  v_claimed_at timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,results_published_at
  into v_run_id,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select claimed_at into v_claimed_at
  from guests
  where id=p_guest_id and active and uses_app
  for share;
  if not found then
    raise exception using errcode='P0002',message='avatar_guest_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='avatar_guest_not_claimed';
  end if;

  return p_guest_id::text||'/'||v_run_id::text||'.jpg';
end;
$$;

create or replace function authorize_guest_assignment_evidence_upload(
  p_assignment_id uuid,
  p_guest_id uuid
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_game_stage text;
  v_results_published_at timestamptz;
  v_assignment_status text;
  v_task_stage text;
  v_claimed_at timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,stage,results_published_at
  into v_run_id,v_game_stage,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select a.status,t.stage,g.claimed_at
  into v_assignment_status,v_task_stage,v_claimed_at
  from assignments a
  join tasks t on t.id=a.task_id
  join guests g on g.id=a.guest_id
  where a.id=p_assignment_id and a.guest_id=p_guest_id
    and g.active and g.uses_app
  for share of a,g;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='assignment_guest_not_claimed';
  end if;
  if v_assignment_status not in('assigned','rejected') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;
  if (v_task_stage='task_round_1' and not phase_one_interactions_open(v_game_stage))
      or (v_task_stage='task_round_2' and v_game_stage not in('task_round_2','banquet','group_game'))
      or (v_task_stage='group_game' and v_game_stage<>'group_game')
      or v_task_stage not in('task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  return p_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
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
  v_results_published_at timestamptz;
  v_guest_id uuid;
  v_assignment_status text;
  v_claimed_at timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,results_published_at
  into v_run_id,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select a.guest_id,a.status,g.claimed_at
  into v_guest_id,v_assignment_status,v_claimed_at
  from assignments a
  join guests g on g.id=a.guest_id
  where a.id=p_assignment_id and g.active and g.uses_app
  for share of a,g;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='assignment_guest_not_claimed';
  end if;
  if v_assignment_status not in('assigned','rejected','submitted') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;

  return v_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
end;
$$;

create or replace function confirm_guest_avatar(
  p_guest_id uuid,
  p_avatar_path text
) returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
  v_results_published_at timestamptz;
  v_claimed_at timestamptz;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,results_published_at
  into v_run_id,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select claimed_at into v_claimed_at
  from guests
  where id=p_guest_id and active and uses_app
  for update;
  if not found then
    raise exception using errcode='P0002',message='avatar_guest_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='avatar_guest_not_claimed';
  end if;

  v_expected_path:=p_guest_id::text||'/'||v_run_id::text||'.jpg';
  if p_avatar_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_avatar_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='guest-avatars' and name=v_expected_path;
  if not found then
    raise exception using errcode='P0002',message='avatar_object_missing';
  end if;

  update guests set avatar_path=v_expected_path,avatar_uploaded_at=v_uploaded_at
  where id=p_guest_id;
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
  v_game_stage text;
  v_results_published_at timestamptz;
  v_assignment_status text;
  v_task_stage text;
  v_claimed_at timestamptz;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,stage,results_published_at
  into v_run_id,v_game_stage,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select a.status,t.stage,g.claimed_at
  into v_assignment_status,v_task_stage,v_claimed_at
  from assignments a
  join tasks t on t.id=a.task_id
  join guests g on g.id=a.guest_id
  where a.id=p_assignment_id and a.guest_id=p_guest_id
    and g.active and g.uses_app
  for update of a,g;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='assignment_guest_not_claimed';
  end if;
  if v_assignment_status not in('assigned','rejected') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;
  if (v_task_stage='task_round_1' and not phase_one_interactions_open(v_game_stage))
      or (v_task_stage='task_round_2' and v_game_stage not in('task_round_2','banquet','group_game'))
      or (v_task_stage='group_game' and v_game_stage<>'group_game')
      or v_task_stage not in('task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  v_expected_path:=p_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
  if p_evidence_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then
    raise exception using errcode='P0002',message='evidence_object_missing';
  end if;

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
  v_run_id uuid;
  v_results_published_at timestamptz;
  v_guest_id uuid;
  v_assignment_status text;
  v_claimed_at timestamptz;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));

  select rehearsal_run_id,results_published_at
  into v_run_id,v_results_published_at
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select a.guest_id,a.status,g.claimed_at
  into v_guest_id,v_assignment_status,v_claimed_at
  from assignments a
  join guests g on g.id=a.guest_id
  where a.id=p_assignment_id and g.active and g.uses_app
  for update of a,g;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_claimed_at is null then
    raise exception using errcode='28000',message='assignment_guest_not_claimed';
  end if;
  if v_assignment_status not in('assigned','rejected','submitted') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;

  v_expected_path:=v_guest_id::text||'/'||v_run_id::text||'/'||p_assignment_id::text||'.jpg';
  if p_evidence_path is distinct from v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then
    raise exception using errcode='P0002',message='evidence_object_missing';
  end if;

  update assignments set evidence_path=v_expected_path,evidence_uploaded_at=v_uploaded_at
  where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence_confirm','assignment',p_assignment_id::text,
    jsonb_build_object('uploaded_at',v_uploaded_at,'run_scoped_path',true));
end;
$$;

revoke all on function authorize_guest_avatar_upload(uuid)
  from public,anon,authenticated;
revoke all on function authorize_guest_assignment_evidence_upload(uuid,uuid)
  from public,anon,authenticated;
revoke all on function authorize_staff_assignment_evidence_upload(uuid)
  from public,anon,authenticated;
revoke all on function confirm_guest_avatar(uuid,text)
  from public,anon,authenticated;
revoke all on function confirm_assignment_evidence(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text)
  from public,anon,authenticated;

grant execute on function authorize_guest_avatar_upload(uuid) to service_role;
grant execute on function authorize_guest_assignment_evidence_upload(uuid,uuid) to service_role;
grant execute on function authorize_staff_assignment_evidence_upload(uuid) to service_role;
grant execute on function confirm_guest_avatar(uuid,text) to service_role;
grant execute on function confirm_assignment_evidence(uuid,uuid,text) to service_role;
grant execute on function confirm_assignment_evidence_staff(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130018','signed_upload.reset_boundary_hardened','game_state','1',jsonb_build_object(
  'shared_reset_lock',true,
  'guest_claim_required',true,
  'authorization_returns_run_scoped_path',true,
  'confirmation_rechecks_current_run',true
));

commit;
