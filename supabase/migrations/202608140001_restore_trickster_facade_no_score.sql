-- A later finale-lock migration replaced approve_assignment after the original
-- phase-one scoring rule had been introduced, but accidentally omitted the
-- rule that a trickster's ordinary-looking first-act facade completes without
-- personal points or an early-completion rank.  Restore that server-authority
-- rule in the latest function definition. Existing runtime rows are left
-- untouched; rehearsal reset remains the supported way to discard rehearsal
-- scores before the formal wedding.

begin;

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
  v_guest_role text;
  v_total integer;
  v_rank integer;
  v_bonus_awarded integer:=0;
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

  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select points,grants_hidden_spy,stage,score_policy
  into v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy
  from tasks where id=v_assignment.task_id;
  if not found then raise exception using errcode='P0002',message='task_not_found'; end if;
  if v_grants_hidden_spy then
    raise exception using errcode='P0001',message='hidden_spy_feature_retired';
  end if;

  select points,role into v_total,v_guest_role
  from guests where id=v_assignment.guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;

  v_points:=case
    when v_score_policy='NO_PERSONAL'
      or (v_task_stage='task_round_1' and v_guest_role='spy') then 0
    else v_task_points
  end;

  if v_points<>0 then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  end if;
  update guests set points=points+v_points where id=v_assignment.guest_id
  returning points into v_total;
  update assignments set status='approved',approved_at=now(),reward_task_id=null,
    reward_clue_id=null where id=v_assignment.id;

  if v_assignment.is_initial and v_points>0 then
    select count(*)::integer+1 into v_rank
    from assignments where is_initial and completion_rank is not null;
    update assignments set completion_rank=v_rank,
      early_bonus_points=case when v_rank between 1 and 3 then 1 else early_bonus_points end
    where id=v_assignment.id;
    if v_rank between 1 and 3 then
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_assignment.guest_id,1,'首轮任务前三名额外奖励',p_actor);
      update guests set points=points+1 where id=v_assignment.guest_id
      returning points into v_total;
      v_bonus_awarded:=1;
      insert into audit_log(actor,action,target_type,target_id,details)
      values(p_actor,'assignment.early_bonus','assignment',v_assignment.id::text,
        jsonb_build_object('guest_id',v_assignment.guest_id,'completion_rank',v_rank,
          'points',1,'reward_policy','points_only'));
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object(
      'guest_id',v_assignment.guest_id,'task_points',v_task_points,
      'points_awarded',v_points,'early_bonus_points',v_bonus_awarded,
      'reason',trim(p_reason),'completion_rank',v_rank,
      'reward_policy','points_only','reward_assignment_id',null,
      'reward_clue_id',null,'hidden_spy_activated',false,
      'trickster_facade_no_score',
        v_task_stage='task_round_1' and v_guest_role='spy'));
  return jsonb_build_object(
    'points_awarded',v_points,'early_bonus_points',v_bonus_awarded,
    'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',null,'reward_clue_id',null,'hidden_spy_activated',false);
end;
$$;

revoke all on function approve_assignment(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function approve_assignment(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608140001','assignment.trickster_facade_no_score_restored',
  'assignments','future',jsonb_build_object(
    'first_act_trickster_facade_points',0,
    'early_completion_rank_awarded',false,
    'existing_runtime_rows_untouched',true,
    'completion_and_audit_preserved',true
  ));

commit;
