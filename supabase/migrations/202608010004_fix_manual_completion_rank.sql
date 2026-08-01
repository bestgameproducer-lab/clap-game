-- Rank only initial assignments that actually receive a completion rank.
-- System-completed pairing and instant-bonus assignments are approved without a
-- rank, so counting every approved assignment made the first human approval
-- start after the visible top-ten window.
begin;

with ranked as (
  select id,row_number() over(order by approved_at nulls last,created_at,id)::integer as new_rank
  from assignments
  where is_initial and completion_rank is not null
)
update assignments a set completion_rank=ranked.new_rank
from ranked where a.id=ranked.id and a.completion_rank is distinct from ranked.new_rank;

create or replace function approve_assignment(p_assignment_id uuid,p_actor text,p_reason text default 'Mission approved')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_assignment assignments%rowtype; v_task_points integer; v_points integer; v_task_stage text; v_score_policy text;
  v_grants_hidden_spy boolean; v_total integer; v_rank integer; v_role text; v_team text; v_eligible boolean;
  v_upgrade_limit integer; v_clue_limit integer; v_reward_task_id uuid; v_reward_assignment_id uuid; v_reward_clue_id uuid; v_game_stage text;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='reason_required'; end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1')); end if;
  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;
  select points,grants_hidden_spy,stage,score_policy into v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy from tasks where id=v_assignment.task_id;
  select points,role,team,eligible_for_secret_role into v_total,v_role,v_team,v_eligible from guests where id=v_assignment.guest_id for update;
  select stage into v_game_stage from game_state where id=1;
  v_points:=case when v_score_policy='NO_PERSONAL' or (v_task_stage='task_round_1' and v_role='spy') then 0 else v_task_points end;
  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_role<>'guest' then raise exception using errcode='P0001',message='hidden_spy_guest_ineligible'; end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then raise exception using errcode='P0001',message='hidden_spy_already_activated'; end if;
  end if;
  if v_points<>0 then insert into points_ledger(guest_id,assignment_id,amount,reason,actor) values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor); end if;
  update guests set points=points+v_points,role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end where id=v_assignment.guest_id
    returning points,role,team,eligible_for_secret_role into v_total,v_role,v_team,v_eligible;
  update assignments set status='approved',approved_at=now() where id=v_assignment.id;
  if v_assignment.is_initial then
    select count(*)::integer+1 into v_rank from assignments
    where is_initial and completion_rank is not null;
    update assignments set completion_rank=v_rank where id=v_assignment.id;
  end if;
  if v_assignment.is_initial and v_game_stage<>'task_round_1' then
    select upgrade_reward_limit,clue_reward_limit into v_upgrade_limit,v_clue_limit from game_state where id=1;
    if v_role<>'spy' and v_rank<=v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t where t.active and t.category='upgrade' and t.stage='task_round_2'
        and t.role_scope in('all',v_role) and not exists(select 1 from assignments a where a.guest_id=v_assignment.guest_id and a.task_id=t.id)
        order by random() limit 1;
      if v_reward_task_id is not null then insert into assignments(guest_id,task_id) values(v_assignment.guest_id,v_reward_task_id) returning id into v_reward_assignment_id;
        update assignments set reward_task_id=v_reward_task_id where id=v_assignment.id; end if;
    end if;
    if v_rank<=v_clue_limit and v_eligible and v_role<>'spy' then
      select c.id into v_reward_clue_id from clues c where c.active and not exists(select 1 from guest_clues gc where gc.guest_id=v_assignment.guest_id and gc.clue_id=c.id)
        and(c.spy_guest_id is null or exists(select 1 from guests spy where spy.id=c.spy_guest_id and spy.team=v_team and spy.role='spy'))
        order by case when c.spy_guest_id is not null then 0 else 1 end,c.level,random() limit 1;
      if v_reward_clue_id is not null then insert into guest_clues(guest_id,clue_id,granted_by) values(v_assignment.guest_id,v_reward_clue_id,p_actor);
        update assignments set reward_clue_id=v_reward_clue_id where id=v_assignment.id; end if;
    end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,jsonb_build_object('guest_id',v_assignment.guest_id,
    'task_points',v_task_points,'points_awarded',v_points,'reason',trim(p_reason),'completion_rank',v_rank,
    'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,'phase_one_reward_suppressed',v_game_stage='task_round_1'));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy);
end; $$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration','completion_rank.manual_only','assignments','initial',jsonb_build_object('policy','ranked_assignments_only'));

commit;
