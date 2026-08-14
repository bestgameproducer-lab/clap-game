-- Keep player-code mutual confirmations aligned with the assignment lifecycle.
-- A photo/staff completion or phase transition can finish an assignment while
-- its fallback confirmation is still pending. Those stale rows must not stay
-- actionable, and a repeated response must never award points twice.

begin;

create or replace function close_terminal_assignment_mutual_confirmations()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status in ('approved','cancelled')
      and new.status is distinct from old.status then
    update assignment_mutual_confirmations
    set status='REJECTED',
        responded_at=coalesce(responded_at,now())
    where assignment_id=new.id and status='PENDING';
  end if;
  return new;
end;
$$;

drop trigger if exists close_terminal_assignment_mutual_confirmations
  on assignments;
create trigger close_terminal_assignment_mutual_confirmations
after update of status on assignments
for each row execute function close_terminal_assignment_mutual_confirmations();

-- Close rows left behind before the lifecycle trigger existed. REJECTED is
-- the existing terminal non-success state; it preserves the audit row without
-- pretending the other guest actually confirmed it.
update assignment_mutual_confirmations confirmation
set status='REJECTED',
    responded_at=coalesce(confirmation.responded_at,now())
from assignments assignment
where confirmation.assignment_id=assignment.id
  and confirmation.status='PENDING'
  and assignment.status in ('approved','cancelled');

create or replace function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_confirmation assignment_mutual_confirmations%rowtype;
  v_assignment assignments%rowtype;
  v_stage text;
  v_code text;
begin
  if p_accept is null then
    raise exception using errcode='22023',message='mutual_confirmation_response_required';
  end if;

  select * into v_confirmation
  from assignment_mutual_confirmations
  where id=p_confirmation_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='mutual_confirmation_not_found';
  end if;
  if v_confirmation.confirmer_guest_id<>p_confirmer_guest_id then
    raise exception using errcode='28000',message='mutual_confirmation_forbidden';
  end if;

  -- A retried accept/reject is a successful no-op. This also absorbs a stale
  -- browser action after another completion path already closed the request.
  if v_confirmation.status<>'PENDING' then
    return;
  end if;

  -- Only a genuinely pending response is a mutation. A lost-response retry
  -- remains a harmless success even if final publication happened meanwhile.
  perform assert_wedding_not_final();

  select a.* into v_assignment
  from assignments a
  where a.id=v_confirmation.assignment_id
  for update;
  if not found then
    update assignment_mutual_confirmations
    set status='REJECTED',responded_at=now()
    where id=v_confirmation.id;
    return;
  end if;
  select mission_code into v_code
  from tasks
  where id=v_assignment.task_id;
  if v_code<>'P1-SOCIAL-001' then
    raise exception using errcode='P0001',message='mutual_confirmation_not_supported';
  end if;

  select stage into v_stage from game_state where id=1 for share;
  -- Accepting completes a task and therefore obeys the phase-one gate.
  -- Rejecting a mistaken invitation remains safe during the ceremony pause.
  if p_accept and not phase_one_interactions_open(v_stage) then
    raise exception using errcode='P0001',message='mutual_confirmation_stage_closed';
  end if;

  if not p_accept or v_assignment.status='cancelled' then
    update assignment_mutual_confirmations
    set status='REJECTED',responded_at=now()
    where id=v_confirmation.id;
  elsif v_assignment.status='approved' then
    update assignment_mutual_confirmations
    set status='ACTIVE',responded_at=now()
    where id=v_confirmation.id;
  elsif v_assignment.status in ('assigned','rejected','submitted') then
    update assignment_mutual_confirmations
    set status='ACTIVE',responded_at=now()
    where id=v_confirmation.id;

    update assignments
    set status='submitted',
        submitted_at=coalesce(submitted_at,now()),
        completion_note='由另一位宾客在软件中确认完成'
    where id=v_confirmation.assignment_id
      and status in ('assigned','rejected');

    perform approve_assignment(
      v_confirmation.assignment_id,
      'system:mutual-confirmation',
      '双方已在软件中确认任务完成'
    );
    update assignments
    set verification_note='双方已在软件中确认任务完成',
        verified_by='system:mutual-confirmation',
        verified_at=coalesce(verified_at,now())
    where id=v_confirmation.assignment_id;
  else
    update assignment_mutual_confirmations
    set status='REJECTED',responded_at=now()
    where id=v_confirmation.id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(
    'guest:'||p_confirmer_guest_id::text,
    'assignment.mutual_respond',
    'assignment_mutual_confirmation',
    v_confirmation.id::text,
    jsonb_build_object(
      'assignment_id',v_confirmation.assignment_id,
      'accepted',p_accept,
      'assignment_status_before',v_assignment.status,
      'completed_now',p_accept and v_assignment.status in ('assigned','rejected','submitted')
    )
  );
end;
$$;

revoke all on function close_terminal_assignment_mutual_confirmations()
  from public,anon,authenticated,service_role;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140008',
  'assignment.mutual_confirmation_lifecycle_closed',
  'game_state','1',
  jsonb_build_object(
    'terminal_assignments_close_pending_requests',true,
    'responses_are_idempotent',true,
    'mistaken_requests_rejectable_during_ceremony',true
  )
);

commit;
