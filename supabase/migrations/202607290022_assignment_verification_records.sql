-- Keep a concise, auditable record of what the guest submitted and how staff verified it.
alter table assignments add column if not exists completion_note text not null default '';
alter table assignments add column if not exists verification_note text not null default '';
alter table assignments add column if not exists verified_by text;
alter table assignments add column if not exists verified_at timestamptz;

do $$ begin
  alter table assignments add constraint assignments_verification_text_length_check check (
    length(completion_note) <= 500
    and length(verification_note) <= 500
    and (verified_by is null or length(verified_by) <= 200)
  );
exception when duplicate_object then null;
end $$;

drop function if exists submit_assignment(uuid,uuid);
create function submit_assignment(
  p_assignment_id uuid,
  p_guest_id uuid,
  p_completion_note text
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if length(trim(coalesce(p_completion_note,'')))>500 then
    raise exception using errcode='22023',message='completion_note_too_long';
  end if;
  update assignments set
    status='submitted',submitted_at=now(),
    completion_note=trim(coalesce(p_completion_note,'')),
    rejected_at=null,rejection_reason=null,
    verification_note='',verified_by=null,verified_at=null
  where id=p_assignment_id and guest_id=p_guest_id and status in ('assigned','rejected');
  if not found then raise exception using errcode='P0001',message='assignment_not_assignable'; end if;
end;
$$;

create or replace function approve_assignment_with_verification(
  p_assignment_id uuid,
  p_actor text,
  p_verification_note text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if nullif(trim(p_verification_note),'') is null or length(trim(p_verification_note))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;
  v_result:=approve_assignment(p_assignment_id,p_actor,trim(p_verification_note));
  update assignments set
    verification_note=trim(p_verification_note),verified_by=p_actor,verified_at=now()
  where id=p_assignment_id;
  return v_result;
end;
$$;

create or replace function complete_assignment_at_station(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default '任务站现场核验通过'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_status text;
begin
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;
  select status into v_status from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_status='approved' then raise exception using errcode='P0001',message='assignment_already_approved'; end if;
  if v_status in ('assigned','rejected') then
    update assignments set
      status='submitted',submitted_at=now(),rejected_at=null,rejection_reason=null
    where id=p_assignment_id;
  elsif v_status<>'submitted' then
    raise exception using errcode='P0001',message='assignment_not_completable';
  end if;
  return approve_assignment_with_verification(p_assignment_id,p_actor,trim(p_reason));
end;
$$;

revoke all on function submit_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function approve_assignment_with_verification(uuid,text,text) from public,anon,authenticated;
revoke all on function complete_assignment_at_station(uuid,text,text) from public,anon,authenticated;
grant execute on function submit_assignment(uuid,uuid,text) to service_role;
grant execute on function approve_assignment_with_verification(uuid,text,text) to service_role;
grant execute on function complete_assignment_at_station(uuid,text,text) to service_role;
