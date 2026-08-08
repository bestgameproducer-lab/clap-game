-- Keep software mutual confirmation exclusive to the new-friend mission.
-- The couple-photo mission requires photo/staff verification and must not be
-- completable by submitting another guest's player code.

begin;

create or replace function request_assignment_mutual_confirmation(
  p_assignment_id uuid,p_owner_guest_id uuid,p_target_code text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_assignment assignments%rowtype; v_target guests%rowtype; v_id uuid; v_stage text; v_code text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='mutual_confirmation_stage_closed'; end if;
  select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and a.guest_id=p_owner_guest_id and a.status in('assigned','rejected') for update of a;
  if not found then raise exception using errcode='P0002',message='mutual_assignment_not_found'; end if;
  select mission_code into v_code from tasks where id=v_assignment.task_id;
  if v_code<>'P1-SOCIAL-001' then raise exception using errcode='P0001',message='mutual_confirmation_not_supported'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code));
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=p_owner_guest_id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if (select count(*) from assignment_mutual_confirmations where confirmer_guest_id=v_target.id and status='ACTIVE')>=2 then
    raise exception using errcode='P0001',message='mutual_confirmer_limit';
  end if;
  insert into assignment_mutual_confirmations(assignment_id,owner_guest_id,confirmer_guest_id,status)
  values(p_assignment_id,p_owner_guest_id,v_target.id,'PENDING')
  on conflict(assignment_id) do update set confirmer_guest_id=excluded.confirmer_guest_id,status='PENDING',responded_at=null,created_at=now()
  where assignment_mutual_confirmations.status='REJECTED'
  returning id into v_id;
  if v_id is null then raise exception using errcode='P0001',message='mutual_confirmation_pending'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_owner_guest_id::text,'assignment.mutual_request','assignment_mutual_confirmation',v_id::text,
    jsonb_build_object('assignment_id',p_assignment_id,'confirmer_guest_id',v_target.id));
  return v_id;
end; $$;

create or replace function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_confirmation assignment_mutual_confirmations%rowtype; v_stage text; v_code text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='mutual_confirmation_stage_closed'; end if;
  select * into v_confirmation from assignment_mutual_confirmations where id=p_confirmation_id for update;
  if not found then raise exception using errcode='P0002',message='mutual_confirmation_not_found'; end if;
  if v_confirmation.confirmer_guest_id<>p_confirmer_guest_id then raise exception using errcode='28000',message='mutual_confirmation_forbidden'; end if;
  if v_confirmation.status<>'PENDING' then raise exception using errcode='P0001',message='mutual_confirmation_already_handled'; end if;
  select t.mission_code into v_code from assignments a join tasks t on t.id=a.task_id where a.id=v_confirmation.assignment_id;
  if v_code<>'P1-SOCIAL-001' then raise exception using errcode='P0001',message='mutual_confirmation_not_supported'; end if;
  update assignment_mutual_confirmations set status=case when p_accept then 'ACTIVE' else 'REJECTED' end,responded_at=now()
  where id=v_confirmation.id;
  if p_accept then
    update assignments set status='submitted',submitted_at=now(),completion_note='由另一位宾客在软件中确认完成' where id=v_confirmation.assignment_id and status in('assigned','rejected');
    perform approve_assignment(v_confirmation.assignment_id,'system:mutual-confirmation','双方已在软件中确认任务完成');
    update assignments set verification_note='双方已在软件中确认任务完成',verified_by='system:mutual-confirmation',verified_at=now()
    where id=v_confirmation.assignment_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_confirmer_guest_id::text,'assignment.mutual_respond','assignment_mutual_confirmation',v_confirmation.id::text,
    jsonb_build_object('assignment_id',v_confirmation.assignment_id,'accepted',p_accept));
end; $$;

revoke all on function request_assignment_mutual_confirmation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function request_assignment_mutual_confirmation(uuid,uuid,text) to service_role;
grant execute on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608080001','assignment.mutual_confirmation_boundary','game_state','1',jsonb_build_object(
  'supported_mission_code','P1-SOCIAL-001','couple_photo_requires_photo_or_staff',true,'runtime_records_preserved',true));

commit;
