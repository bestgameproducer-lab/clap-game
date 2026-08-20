-- Let tricksters build a believable visible score during play while removing
-- that score from the final placement rule. Lonely Cupid now transfers an
-- exact three points from one locked target at the final settlement boundary.

begin;

-- The official catalog is immutable at runtime. Version the Lonely Cupid copy
-- and keep the registration preflight's exact text contract in sync.
alter table tasks disable trigger guard_retired_and_official_task_catalog;
update tasks
set title='孤单丘比特 · 偷心行动',
    description='第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并秘密锁定目标；最终揭晓时，你会从对方转移 3 点个人积分到自己（对方 -3，你 +3）。目标一旦提交不能修改，分数不足 3 点时也会完整扣除，你的选择需要保密。',
    verification_method='在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时自动转移 3 点个人积分。'
where mission_code='P2-LONELY-001';
update tasks
set title='超级幸运星',
    description='你从第一幕的“丘比特幸运星”升级为“超级幸运星”。第二幕开启时，系统会立即发放“第一阶段积分快照 + 2”的额外个人分，并自动完成此能力；无需再次提交。',
    verification_method='第二阶段开启时由系统立即结算并标记完成；无需手动提交。'
where mission_code='P2-LUCKY-001';
alter table tasks enable trigger guard_retired_and_official_task_catalog;

do $catalog_gate$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=replace(
    replace(
      replace(
        v_definition,
        '孤单丘比特 · 命运复制',
        '孤单丘比特 · 偷心行动'
      ),
      '第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并锁定命运；最终揭晓时，你会获得与该玩家第二轮正式任务积分相同的分数。后台人工调整、第一轮积分、丘比特幸运星翻倍与投票奖励都不计入复制。目标一旦提交不能修改，你的选择需要保密。',
      '第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并秘密锁定目标；最终揭晓时，你会从对方转移 3 点个人积分到自己（对方 -3，你 +3）。目标一旦提交不能修改，分数不足 3 点时也会完整扣除，你的选择需要保密。'
    ),
    '在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时按第二轮正式任务积分自动复制。',
    '在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时自动转移 3 点个人积分。'
  );
  v_updated:=replace(
    v_updated,
    '(''P2-LUCKY-001'',''丘比特幸运星'',''',
    '(''P2-LUCKY-001'',''超级幸运星'','''
  );
  v_updated:=replace(
    v_updated,
    '第二阶段开启时，系统立即按你第一阶段已经获得的个人积分发放同额奖励，并自动完成此任务。如果你的第一项任务也是“丘比特幸运星”，再额外获得 2 分。',
    '你从第一幕的“丘比特幸运星”升级为“超级幸运星”。第二幕开启时，系统会立即发放“第一阶段积分快照 + 2”的额外个人分，并自动完成此能力；无需再次提交。'
  );
  v_updated:=replace(
    v_updated,
    '第二阶段开启时由系统立即结算并标记完成。',
    '第二阶段开启时由系统立即结算并标记完成；无需手动提交。'
  );
  if v_updated=v_definition
      or position('孤单丘比特 · 偷心行动' in v_updated)=0
      or position('对方 -3，你 +3' in v_updated)=0
      or position('''P2-LUCKY-001'',''超级幸运星''' in v_updated)=0
      or position('第一阶段积分快照 + 2' in v_updated)=0 then
    raise exception using errcode='P0001',message='formal_catalog_lonely_cupid_steal_patch_failed';
  end if;
  execute v_updated;
end;
$catalog_gate$;

-- Remove only the late facade-specific zeroing clause. The ordinary social
-- task remains STANDARD, so every completion path now awards its normal two
-- points. Tricksters still cannot consume the staff-verified first-three honor:
-- that separate reward would be more than camouflage. The application excludes
-- every trickster score from final placement at reveal.
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

  v_points:=case when v_score_policy='NO_PERSONAL' then 0 else v_task_points end;

  if v_points<>0 then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  end if;
  update guests set points=points+v_points where id=v_assignment.guest_id
  returning points into v_total;
  update assignments set status='approved',approved_at=now(),reward_task_id=null,
    reward_clue_id=null where id=v_assignment.id;

  if v_assignment.is_initial and v_points>0
      and p_actor not like 'system:%'
      and not (v_task_stage='task_round_1' and v_guest_role='spy') then
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
      'trickster_facade_camouflage_score',
        v_task_stage='task_round_1' and v_guest_role='spy'));
  return jsonb_build_object(
    'points_awarded',v_points,'early_bonus_points',v_bonus_awarded,
    'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',null,'reward_clue_id',null,'hidden_spy_activated',false);
end;
$$;

revoke all on function approve_assignment(uuid,text,text)
  from public,anon,authenticated,service_role;

create or replace function settle_phase_two_copy_and_captain(p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_choice phase_two_copy_choices%rowtype;
  v_lonely_profile phase_two_profiles%rowtype;
  v_target_profile phase_two_profiles%rowtype;
  v_transfer_points constant integer:=3;
  v_transfer_applied integer:=0;
  v_assignment_id uuid;
  v_top_team_score integer;
  v_captain phase_two_profiles%rowtype;
  v_captain_points integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-personal-settlement-v1'));

  -- Captain settlement is unchanged and remains first for deterministic final
  -- scoring, even though Lonely Cupid no longer copies another task result.
  select max(score) into v_top_team_score from(
    select team,coalesce(sum(amount),0)::integer score
    from team_points_ledger
    where team in('海岛组','沙漠组')
    group by team
  ) totals;
  select * into v_captain
  from phase_two_profiles
  where primary_mission='TEAM_CAPTAIN'
  for update;
  if found and v_captain.captain_bonus_settled_at is null then
    if coalesce(v_top_team_score,0)>0 and
        (select coalesce(sum(amount),0) from team_points_ledger where team=v_captain.team)=v_top_team_score then
      select a.id into v_assignment_id
      from assignments a
      join tasks t on t.id=a.task_id
      where a.guest_id=v_captain.guest_id and t.mission_code='P2-GUIDE-001'
      limit 1;
      if v_assignment_id is null then
        raise exception using errcode='P0001',message='phase_two_assignment_missing';
      end if;
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_captain.guest_id,v_assignment_id,4,'领航星队长 · 团队第一',p_actor);
      update guests set points=points+4 where id=v_captain.guest_id;
      v_captain_points:=4;
    end if;
    update phase_two_profiles
    set captain_bonus_settled_at=now(),updated_at=now()
    where guest_id=v_captain.guest_id;
    update assignments
    set status='approved',approved_at=now(),verified_at=now(),
      verification_note=case when v_captain_points=4
        then '所在团队获得第一，系统奖励 4 分'
        else '团队排名已结算'
      end
    where guest_id=v_captain.guest_id
      and task_id=(select id from tasks where mission_code='P2-GUIDE-001');
  end if;

  select * into v_lonely_profile
  from phase_two_profiles
  where primary_mission='COPY_SCORE'
  for update;
  if found then
    select * into v_choice
    from phase_two_copy_choices
    where guest_id=v_lonely_profile.guest_id
    for update;
    if found and v_choice.settled_at is null then
      select * into v_target_profile
      from phase_two_profiles
      where guest_id=v_choice.target_guest_id and unlocked_at is not null;
      if not found or v_choice.target_guest_id=v_lonely_profile.guest_id then
        raise exception using errcode='P0001',message='phase_two_copy_target_invalid';
      end if;

      -- Lock both score rows in UUID order so retries or simultaneous finale
      -- work cannot deadlock or apply only one side of the transfer.
      perform 1
      from guests
      where id in(v_lonely_profile.guest_id,v_choice.target_guest_id)
      order by id
      for update;
      if (select count(*) from guests where id in(v_lonely_profile.guest_id,v_choice.target_guest_id))<>2 then
        raise exception using errcode='P0002',message='phase_two_transfer_guest_missing';
      end if;

      select a.id into v_assignment_id
      from assignments a
      join tasks t on t.id=a.task_id
      where a.guest_id=v_lonely_profile.guest_id and t.mission_code='P2-LONELY-001'
      limit 1;
      if v_assignment_id is null then
        raise exception using errcode='P0001',message='phase_two_assignment_missing';
      end if;

      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_choice.target_guest_id,-v_transfer_points,'孤单丘比特 · 被偷走 3 分',p_actor);
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_lonely_profile.guest_id,v_assignment_id,v_transfer_points,'孤单丘比特 · 偷心行动',p_actor);
      update guests set points=points-v_transfer_points where id=v_choice.target_guest_id;
      update guests set points=points+v_transfer_points where id=v_lonely_profile.guest_id;
      v_transfer_applied:=v_transfer_points;

      update phase_two_copy_choices
      set settled_points=v_transfer_points,settled_at=now()
      where guest_id=v_lonely_profile.guest_id;
      update assignments
      set status='approved',approved_at=now(),verified_at=now(),
        verification_note='偷心行动已由系统转移 3 分'
      where guest_id=v_lonely_profile.guest_id
        and task_id=(select id from tasks where mission_code='P2-LONELY-001');
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.personal_settle','game_state','1',jsonb_build_object(
    'lonely_cupid_transfer_points',v_transfer_applied,
    'lonely_cupid_target_guest_id',v_choice.target_guest_id,
    'captain_points',v_captain_points,
    'lonely_cupid_rule','exact_three_point_transfer',
    'captain_settled_first',true));
  return jsonb_build_object(
    'copy_points',v_transfer_applied,
    'transfer_points',v_transfer_applied,
    'captain_points',v_captain_points);
end;
$$;

revoke all on function settle_phase_two_copy_and_captain(text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608200001','gameplay.trickster_camouflage_lonely_steal',
  'game_state','1',jsonb_build_object(
    'forward_only',true,
    'trickster_facade_visible_points',2,
    'trickster_facade_early_honor_eligible',false,
    'trickster_points_excluded_from_final_ranking',true,
    'lonely_cupid_transfer_points',3,
    'lonely_cupid_target_may_go_negative',true,
    'act_two_lucky_title','超级幸运星',
    'existing_runtime_preserved',true
  ));

commit;
