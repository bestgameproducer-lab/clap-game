-- Allow authenticated wedding staff to attach private evidence while verifying a task.
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
  v_status text;
  v_expected_path text;
  v_uploaded_at timestamptz;
begin
  select guest_id,status into v_guest_id,v_status
  from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_status not in ('assigned','rejected','submitted') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;

  v_expected_path:=v_guest_id::text||'/'||p_assignment_id::text||'/evidence.jpg';
  if p_evidence_path<>v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='evidence_object_missing'; end if;

  update assignments set evidence_path=v_expected_path,evidence_uploaded_at=v_uploaded_at
  where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence.staff_confirm','assignment',p_assignment_id::text,
    jsonb_build_object('guest_id',v_guest_id,'status',v_status));
end;
$$;

create or replace function clear_assignment_evidence_staff(
  p_assignment_id uuid,
  p_actor text
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest_id uuid;
  v_status text;
  v_path text;
begin
  select guest_id,status,evidence_path into v_guest_id,v_status,v_path
  from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_status not in ('assigned','rejected','submitted') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;

  update assignments set evidence_path=null,evidence_uploaded_at=null where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.evidence.staff_clear','assignment',p_assignment_id::text,
    jsonb_build_object('guest_id',v_guest_id,'status',v_status,'had_evidence',v_path is not null));
  return v_path;
end;
$$;

revoke all on function confirm_assignment_evidence_staff(uuid,text,text) from public,anon,authenticated;
revoke all on function clear_assignment_evidence_staff(uuid,text) from public,anon,authenticated;
grant execute on function confirm_assignment_evidence_staff(uuid,text,text) to service_role;
grant execute on function clear_assignment_evidence_staff(uuid,text) to service_role;
