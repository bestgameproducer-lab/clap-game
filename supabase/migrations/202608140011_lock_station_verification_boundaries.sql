-- Keep the task station inside each mission's declared verification contract.
-- Staff may recover a host/staff/photo/mutual confirmation, but must never
-- settle a secret choice, automatic power, or other system-owned mission.
-- Likewise, the private evidence bucket is reserved for PHOTO missions.

begin;

create or replace function complete_assignment_at_station(
  p_assignment_id uuid,p_actor text,
  p_reason text default '任务站现场核验通过'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task_stage text;
  v_task_category text;
  v_verification_type text;
  v_game_stage text;
begin
  perform assert_wedding_not_final();

  select t.stage,t.category,t.verification_type,s.stage
  into v_task_stage,v_task_category,v_verification_type,v_game_stage
  from assignments a
  join tasks t on t.id=a.task_id
  cross join game_state s
  where a.id=p_assignment_id and s.id=1;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_task_category='hidden' then
    raise exception using errcode='P0001',message='station_hidden_assignment_forbidden';
  end if;
  if coalesce(v_verification_type,'') not in(
    'HOST_CONFIRM','STAFF_CONFIRM','PHOTO','MUTUAL_CONFIRM'
  ) then
    raise exception using errcode='P0001',message='station_manual_completion_forbidden';
  end if;
  if (v_task_stage='task_round_1' and not phase_one_interactions_open(v_game_stage))
      or (v_task_stage='task_round_2' and v_game_stage not in('task_round_2','banquet','group_game'))
      or (v_task_stage='group_game' and v_game_stage<>'group_game')
      or v_task_stage not in('task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  return complete_assignment_at_station_before_final_lock(
    p_assignment_id,p_actor,p_reason
  );
end;
$$;

create or replace function assert_staff_assignment_evidence_change_open(
  p_assignment_id uuid,p_require_photo boolean
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
  v_verification_type text;
  v_game_stage text;
  v_results_published_at timestamptz;
  v_claimed_at timestamptz;
begin
  select a.guest_id,a.status,t.stage,t.category,t.verification_type,s.stage,
    s.results_published_at,g.claimed_at
  into v_guest_id,v_status,v_task_stage,v_task_category,v_verification_type,
    v_game_stage,v_results_published_at,v_claimed_at
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
  if p_require_photo and coalesce(v_verification_type,'')<>'PHOTO' then
    raise exception using errcode='P0001',message='station_photo_evidence_forbidden';
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

create or replace function assert_staff_assignment_evidence_open(
  p_assignment_id uuid
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
begin
  return assert_staff_assignment_evidence_change_open(p_assignment_id,true);
end;
$$;

-- Removing a historical pointer is privacy-safe even when the task was never
-- meant to accept a photo. Keep all status/stage/final/run checks, but do not
-- strand stale evidence after tightening the write boundary above.
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
  perform assert_staff_assignment_evidence_change_open(p_assignment_id,false);
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

revoke all on function complete_assignment_at_station(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function assert_staff_assignment_evidence_open(uuid)
  from public,anon,authenticated,service_role;
revoke all on function assert_staff_assignment_evidence_change_open(uuid,boolean)
  from public,anon,authenticated,service_role;
revoke all on function clear_assignment_evidence_staff(uuid,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140011',
  'station.verification_boundaries_locked',
  'game_state','1',
  jsonb_build_object(
    'manual_completion_types',jsonb_build_array(
      'HOST_CONFIRM','STAFF_CONFIRM','PHOTO','MUTUAL_CONFIRM'
    ),
    'staff_photo_type','PHOTO',
    'system_tasks_station_locked',true
  )
);

commit;
