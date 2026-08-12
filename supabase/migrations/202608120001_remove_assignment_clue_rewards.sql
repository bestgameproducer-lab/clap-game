-- Mission completion now awards points only. Clues are released exclusively by
-- explicit staff grants or the phase-two team-clue settlement. The previous
-- approval function compared the wedding stage with the task catalog stage and
-- could therefore treat waiting/ceremony stages as phase two, leaking any active
-- legacy clue to an early phase-one finisher.

begin;

-- Revoke only clues whose provenance is an assignment's automatic reward link.
-- Team-settlement and explicit staff grants have no assignment.reward_clue_id
-- link and are deliberately preserved.
with revoked as (
  delete from guest_clues gc
  using assignments a
  where a.guest_id=gc.guest_id
    and a.reward_clue_id=gc.clue_id
  returning gc.id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608120001','assignment.legacy_clue_rewards_revoked','guest_clues','batch',
  jsonb_build_object('count',count(*),'policy','mission_completion_points_only')
from revoked;

update assignments
set reward_clue_id=null,reward_task_id=null
where reward_clue_id is not null or reward_task_id is not null;

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default 'Mission approved'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_task_points integer;
  v_points integer;
  v_task_stage text;
  v_score_policy text;
  v_grants_hidden_spy boolean;
  v_total integer;
  v_rank integer;
  v_role text;
  v_team text;
  v_eligible boolean;
begin
  if nullif(trim(p_reason),'') is null then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;

  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then
    raise exception using errcode='P0001',message='assignment_not_submitted';
  end if;

  select points,grants_hidden_spy,stage,score_policy
  into v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy
  from tasks where id=v_assignment.task_id;
  select points,role,team,eligible_for_secret_role
  into v_total,v_role,v_team,v_eligible
  from guests where id=v_assignment.guest_id for update;

  v_points:=case
    when v_score_policy='NO_PERSONAL'
      or (v_task_stage='task_round_1' and v_role='spy') then 0
    else v_task_points
  end;

  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_role<>'guest' then
      raise exception using errcode='P0001',message='hidden_spy_guest_ineligible';
    end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
  end if;

  if v_points<>0 then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  end if;
  update guests set
    points=points+v_points,
    role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end
  where id=v_assignment.guest_id
  returning points,role,team,eligible_for_secret_role
  into v_total,v_role,v_team,v_eligible;

  update assignments
  set status='approved',approved_at=now(),reward_task_id=null,reward_clue_id=null
  where id=v_assignment.id;

  if v_assignment.is_initial then
    select count(*)::integer+1 into v_rank
    from assignments
    where is_initial and completion_rank is not null;
    update assignments set completion_rank=v_rank where id=v_assignment.id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object(
      'guest_id',v_assignment.guest_id,
      'task_points',v_task_points,
      'points_awarded',v_points,
      'reason',trim(p_reason),
      'completion_rank',v_rank,
      'reward_policy','points_only',
      'reward_assignment_id',null,
      'reward_clue_id',null,
      'hidden_spy_activated',v_grants_hidden_spy
    ));
  return jsonb_build_object(
    'points_awarded',v_points,
    'guest_total',v_total,
    'completion_rank',v_rank,
    'reward_assignment_id',null,
    'reward_clue_id',null,
    'hidden_spy_activated',v_grants_hidden_spy
  );
end;
$$;

revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
grant execute on function approve_assignment(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608120001','assignment.reward_policy_hardened','assignments','all',
  jsonb_build_object(
    'policy','mission_completion_points_only',
    'automatic_clues',false,
    'automatic_upgrade_tasks',false,
    'team_settlement_preserved',true,
    'explicit_staff_grants_preserved',true
  ));

commit;
