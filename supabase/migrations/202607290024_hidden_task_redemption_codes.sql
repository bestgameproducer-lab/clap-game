-- One-time physical hidden-task card codes. Only hashes are stored.
create table if not exists hidden_task_codes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references tasks(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  issued_by text not null,
  issued_at timestamptz not null default now(),
  claimed_by uuid references guests(id) on delete restrict,
  claimed_at timestamptz,
  assignment_id uuid unique references assignments(id) on delete restrict,
  constraint hidden_task_code_claim_check check (
    (claimed_by is null and claimed_at is null and assignment_id is null)
    or (claimed_by is not null and claimed_at is not null and assignment_id is not null)
  )
);

create index if not exists hidden_task_codes_claimed_idx
  on hidden_task_codes(claimed_at desc nulls last);

alter table hidden_task_codes enable row level security;

create or replace function issue_hidden_task_code(
  p_task_id uuid,
  p_code_hash text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code_id uuid;
  v_claimed_at timestamptz;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_hidden_task_code_hash';
  end if;
  if nullif(trim(p_actor),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;
  if not exists(select 1 from tasks where id=p_task_id and active and category='hidden') then
    raise exception using errcode='P0002',message='hidden_task_not_found';
  end if;
  select id,claimed_at into v_code_id,v_claimed_at
  from hidden_task_codes where task_id=p_task_id for update;
  if found then
    if v_claimed_at is not null then
      raise exception using errcode='P0001',message='hidden_task_code_already_claimed';
    end if;
    update hidden_task_codes set code_hash=p_code_hash,issued_by=p_actor,issued_at=now()
    where id=v_code_id;
  else
    insert into hidden_task_codes(task_id,code_hash,issued_by,issued_at)
    values(p_task_id,p_code_hash,p_actor,now()) returning id into v_code_id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'hidden_task_code.issue','hidden_task_code',v_code_id::text,
    jsonb_build_object('task_id',p_task_id));
  return v_code_id;
end;
$$;

create or replace function redeem_hidden_task_code(
  p_guest_id uuid,
  p_code_hash text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code hidden_task_codes%rowtype;
  v_guest guests%rowtype;
  v_assignment_id uuid;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_hidden_task_code_hash';
  end if;
  select * into v_code from hidden_task_codes where code_hash=p_code_hash for update;
  if not found then raise exception using errcode='P0002',message='hidden_task_code_invalid'; end if;
  if v_code.claimed_at is not null then
    raise exception using errcode='P0001',message='hidden_task_code_already_claimed';
  end if;

  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='guest_card_not_drawn';
  end if;

  v_assignment_id:=assign_task_to_guest(p_guest_id,v_code.task_id,p_actor);
  update hidden_task_codes set
    claimed_by=p_guest_id,
    claimed_at=now(),
    assignment_id=v_assignment_id
  where id=v_code.id;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'hidden_task_code.redeem','hidden_task_code',v_code.id::text,
    jsonb_build_object('task_id',v_code.task_id,'guest_id',p_guest_id,'assignment_id',v_assignment_id));
  return v_assignment_id;
end;
$$;

revoke all on table hidden_task_codes from public,anon,authenticated;
revoke all on function issue_hidden_task_code(uuid,text,text) from public,anon,authenticated;
revoke all on function redeem_hidden_task_code(uuid,text,text) from public,anon,authenticated;
grant execute on function issue_hidden_task_code(uuid,text,text) to service_role;
grant execute on function redeem_hidden_task_code(uuid,text,text) to service_role;
