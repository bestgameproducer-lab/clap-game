-- Private, one-photo-per-assignment evidence storage. All access is server-authorized.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-evidence','task-evidence',false,2097152,array['image/jpeg']::text[])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table assignments add column if not exists evidence_path text;
alter table assignments add column if not exists evidence_uploaded_at timestamptz;

do $$ begin
  alter table assignments add constraint assignments_evidence_path_check check (
    evidence_path is null or (
      length(evidence_path) <= 250
      and evidence_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/evidence[.]jpg$'
    )
  );
exception when duplicate_object then null;
end $$;

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
  v_status text;
  v_expected_path text:=p_guest_id::text||'/'||p_assignment_id::text||'/evidence.jpg';
  v_uploaded_at timestamptz;
begin
  select status into v_status from assignments
  where id=p_assignment_id and guest_id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_status not in ('assigned','rejected') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;
  if p_evidence_path<>v_expected_path then
    raise exception using errcode='22023',message='invalid_evidence_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='task-evidence' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='evidence_object_missing'; end if;
  update assignments set evidence_path=v_expected_path,evidence_uploaded_at=v_uploaded_at
  where id=p_assignment_id;
end;
$$;

create or replace function clear_assignment_evidence(
  p_assignment_id uuid,
  p_guest_id uuid
) returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text;
  v_path text;
begin
  select status,evidence_path into v_status,v_path from assignments
  where id=p_assignment_id and guest_id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_status not in ('assigned','rejected') then
    raise exception using errcode='P0001',message='assignment_evidence_locked';
  end if;
  update assignments set evidence_path=null,evidence_uploaded_at=null where id=p_assignment_id;
  return v_path;
end;
$$;

revoke all on function confirm_assignment_evidence(uuid,uuid,text) from public,anon,authenticated;
revoke all on function clear_assignment_evidence(uuid,uuid) from public,anon,authenticated;
grant execute on function confirm_assignment_evidence(uuid,uuid,text) to service_role;
grant execute on function clear_assignment_evidence(uuid,uuid) to service_role;
