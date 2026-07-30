-- Approval must not roll back when a public story-role guest is intentionally
-- ineligible for secret clues. Completion and personal points remain valid;
-- automatic clue rewards are offered only to secret-role-eligible guests.
create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default 'Mission approved'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_points integer;
  v_grants_hidden_spy boolean;
  v_total integer;
  v_rank integer;
  v_role text;
  v_team text;
  v_eligible_for_secret_role boolean;
  v_upgrade_limit integer;
  v_clue_limit integer;
  v_reward_task_id uuid;
  v_reward_assignment_id uuid;
  v_reward_clue_id uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='reason_required'; end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;
  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;

  select points,grants_hidden_spy into v_points,v_grants_hidden_spy from tasks where id=v_assignment.task_id;
  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    select role,team into v_role,v_team from guests where id=v_assignment.guest_id for update;
    if v_role<>'guest' then raise exception using errcode='P0001',message='hidden_spy_guest_ineligible'; end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
  end if;

  insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
  values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  update guests set points=points+v_points,
    role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end
  where id=v_assignment.guest_id
  returning points,role,team,eligible_for_secret_role
    into v_total,v_role,v_team,v_eligible_for_secret_role;
  update assignments set status='approved',approved_at=now() where id=v_assignment.id;

  if v_assignment.is_initial then
    select upgrade_reward_limit,clue_reward_limit into v_upgrade_limit,v_clue_limit from game_state where id=1;
    select count(*)::integer into v_rank from assignments where is_initial and status='approved';
    update assignments set completion_rank=v_rank where id=v_assignment.id;

    if v_rank<=v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t
      where t.active and t.category='upgrade' and t.stage='task_round_2'
        and t.role_scope in ('all',v_role)
        and not exists(select 1 from assignments a where a.guest_id=v_assignment.guest_id and a.task_id=t.id)
      order by random() limit 1;
      if v_reward_task_id is not null then
        insert into assignments(guest_id,task_id) values(v_assignment.guest_id,v_reward_task_id)
        returning id into v_reward_assignment_id;
        update assignments set reward_task_id=v_reward_task_id where id=v_assignment.id;
      end if;
    end if;

    if v_rank<=v_clue_limit and v_eligible_for_secret_role and v_role<>'spy' then
      select c.id into v_reward_clue_id from clues c
      where c.active
        and not exists(select 1 from guest_clues gc where gc.guest_id=v_assignment.guest_id and gc.clue_id=c.id)
        and (
          c.spy_guest_id is null or
          exists(select 1 from guests spy where spy.id=c.spy_guest_id and spy.team=v_team and spy.role='spy')
        )
      order by case when c.spy_guest_id is not null then 0 else 1 end,c.level,random()
      limit 1;
      if v_reward_clue_id is not null then
        insert into guest_clues(guest_id,clue_id,granted_by)
        values(v_assignment.guest_id,v_reward_clue_id,p_actor);
        update assignments set reward_clue_id=v_reward_clue_id where id=v_assignment.id;
      end if;
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object('guest_id',v_assignment.guest_id,'points',v_points,'reason',trim(p_reason),
      'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,
      'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy,
      'secret_clue_eligible',v_eligible_for_secret_role));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,
    'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,
    'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy);
end;
$$;

revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
grant execute on function approve_assignment(uuid,text,text) to service_role;
