-- Bind every staff operation that mutates rehearsal-owned assignments,
-- relationships, clue grants, or private evidence to the run displayed by
-- the operator. A delayed request from an old browser tab must never approve,
-- reject, repopulate, or attach evidence inside the newly reset wedding.

begin;

create or replace function approve_assignment_with_verification_for_run(
  p_assignment_id uuid,p_actor text,p_verification_note text,
  p_rehearsal_run_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return approve_assignment_with_verification(
    p_assignment_id,p_actor,p_verification_note
  );
end;
$$;

create or replace function reject_assignment_for_run(
  p_assignment_id uuid,p_actor text,p_reason text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform reject_assignment(p_assignment_id,p_actor,p_reason);
end;
$$;

create or replace function complete_assignment_at_station_for_run(
  p_assignment_id uuid,p_actor text,p_reason text,p_rehearsal_run_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return complete_assignment_at_station(p_assignment_id,p_actor,p_reason);
end;
$$;

create or replace function assign_task_to_guest_for_run(
  p_guest_id uuid,p_task_id uuid,p_actor text,p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return assign_task_to_guest(p_guest_id,p_task_id,p_actor);
end;
$$;

create or replace function reassign_task_assignment_for_run(
  p_assignment_id uuid,p_task_id uuid,p_actor text,p_reason text,
  p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return reassign_task_assignment(
    p_assignment_id,p_task_id,p_actor,p_reason
  );
end;
$$;

create or replace function update_ceremony_assignment_for_run(
  p_assignment_id uuid,p_ceremony_status text,p_ring_variant text,p_actor text,
  p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform update_ceremony_assignment(
    p_assignment_id,p_ceremony_status,p_ring_variant,p_actor
  );
end;
$$;

create or replace function grant_guest_clue_for_run(
  p_guest_id uuid,p_clue_id uuid,p_actor text,p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return grant_guest_clue(p_guest_id,p_clue_id,p_actor);
end;
$$;

create or replace function undo_player_relationship_for_run(
  p_relationship_id uuid,p_actor text,p_reason text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform undo_player_relationship(p_relationship_id,p_actor,p_reason);
end;
$$;

create or replace function authorize_staff_assignment_evidence_upload_for_run(
  p_assignment_id uuid,p_rehearsal_run_id uuid
) returns text
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return authorize_staff_assignment_evidence_upload(p_assignment_id);
end;
$$;

create or replace function confirm_assignment_evidence_staff_for_run(
  p_assignment_id uuid,p_evidence_path text,p_actor text,
  p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform confirm_assignment_evidence_staff(
    p_assignment_id,p_evidence_path,p_actor
  );
end;
$$;

create or replace function clear_assignment_evidence_staff_for_run(
  p_assignment_id uuid,p_actor text,p_rehearsal_run_id uuid
) returns text
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return clear_assignment_evidence_staff(p_assignment_id,p_actor);
end;
$$;

-- Only the run-scoped wrappers are application entry points. Their definer
-- can still delegate to the canonical implementations, which retain all
-- existing validation, scoring, audit, final-lock, and upload-path rules.
revoke all on function approve_assignment_with_verification(uuid,text,text)
  from service_role;
revoke all on function reject_assignment(uuid,text,text) from service_role;
revoke all on function complete_assignment_at_station(uuid,text,text)
  from service_role;
revoke all on function assign_task_to_guest(uuid,uuid,text) from service_role;
revoke all on function reassign_task_assignment(uuid,uuid,text,text)
  from service_role;
revoke all on function update_ceremony_assignment(uuid,text,text,text)
  from service_role;
revoke all on function grant_guest_clue(uuid,uuid,text) from service_role;
revoke all on function undo_player_relationship(uuid,text,text)
  from service_role;
revoke all on function authorize_staff_assignment_evidence_upload(uuid)
  from service_role;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text)
  from service_role;
revoke all on function clear_assignment_evidence_staff(uuid,text)
  from service_role;

revoke all on function approve_assignment_with_verification_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function reject_assignment_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function complete_assignment_at_station_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function assign_task_to_guest_for_run(uuid,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function reassign_task_assignment_for_run(uuid,uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function update_ceremony_assignment_for_run(uuid,text,text,text,uuid)
  from public,anon,authenticated;
revoke all on function grant_guest_clue_for_run(uuid,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function undo_player_relationship_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function authorize_staff_assignment_evidence_upload_for_run(uuid,uuid)
  from public,anon,authenticated;
revoke all on function confirm_assignment_evidence_staff_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function clear_assignment_evidence_staff_for_run(uuid,text,uuid)
  from public,anon,authenticated;

grant execute on function approve_assignment_with_verification_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function reject_assignment_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function complete_assignment_at_station_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function assign_task_to_guest_for_run(uuid,uuid,text,uuid)
  to service_role;
grant execute on function reassign_task_assignment_for_run(uuid,uuid,text,text,uuid)
  to service_role;
grant execute on function update_ceremony_assignment_for_run(uuid,text,text,text,uuid)
  to service_role;
grant execute on function grant_guest_clue_for_run(uuid,uuid,text,uuid)
  to service_role;
grant execute on function undo_player_relationship_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function authorize_staff_assignment_evidence_upload_for_run(uuid,uuid)
  to service_role;
grant execute on function confirm_assignment_evidence_staff_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function clear_assignment_evidence_staff_for_run(uuid,text,uuid)
  to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130024','staff_runtime.rehearsal_scoped','game_state','1',jsonb_build_object(
  'shared_reset_boundary',true,
  'stale_staff_page_rejected',true,
  'assignment_mutation_count',6,
  'relationship_and_clue_mutation_count',2,
  'staff_evidence_mutation_count',3
));

commit;
