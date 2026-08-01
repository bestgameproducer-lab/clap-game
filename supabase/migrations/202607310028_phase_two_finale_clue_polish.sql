-- Polish act-two secrecy, settle Cupid's lucky star immediately, and add
-- organizer-defined clue groups without rewriting existing runtime records.

begin;

alter table clues add column if not exists group_name text not null default '通用线索';
alter table clues drop constraint if exists clues_group_name_check;
alter table clues add constraint clues_group_name_check
  check (length(trim(group_name)) between 1 and 60);

create or replace function save_game_clue_v2(
  p_clue_id uuid,p_title text,p_content text,p_group_name text,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_group text:=trim(coalesce(p_group_name,''));
begin
  if nullif(trim(coalesce(p_title,'')),'') is null or length(trim(p_title))>120
      or nullif(trim(coalesce(p_content,'')),'') is null or length(trim(p_content))>1000
      or v_group='' or length(v_group)>60 then
    raise exception using errcode='22023',message='clue_content_required';
  end if;
  if p_clue_id is null then
    insert into clues(title,content,group_name,active,spy_guest_id,level)
    values(trim(p_title),trim(p_content),v_group,true,null,1) returning id into v_id;
  else
    update clues set title=trim(p_title),content=trim(p_content),group_name=v_group,active=true
    where id=p_clue_id returning id into v_id;
    if v_id is null then raise exception using errcode='P0002',message='clue_not_found'; end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.save','clue',v_id::text,jsonb_build_object(
    'title',trim(p_title),'group_name',v_group,'active',true));
  return v_id;
end;
$$;

revoke all on function save_game_clue_v2(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function save_game_clue_v2(uuid,text,text,text,text) to service_role;

update tasks set
  description='你和爱心伙伴必须各自秘密选择“爱”或“恨”，全程不能商量、暗示或展示页面。双方都选爱：各得 3 分；一方选爱、一方选恨：爱为 0 分、恨为 5 分；双方都选恨：各得 1 分。',
  verification_method='双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。'
where mission_code='P2-HEART-001';

update tasks set
  description='你和星光伙伴必须各自秘密选择“同行”或“独占”，全程不能商量、暗示或展示页面。双方都选同行：各得 3 分；一方同行、一方独占：同行为 0 分、独占为 5 分；双方都选独占：各得 1 分。',
  verification_method='双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。'
where mission_code='P2-STAR-001';

update tasks set
  description='你是本队公开的领航星队长。你可以主动告诉队友自己的队长身份，负责召集队员、理解团队挑战规则并协助推进；队长身份不需要保密。'
where mission_code='P2-GUIDE-001';

update tasks set title='丘比特幸运星',
  description='第二阶段开启时，系统立即按你第一阶段已经获得的个人积分发放同额奖励，并自动完成此任务。如果你的第一项任务也是“丘比特幸运星”，再额外获得 2 分。',
  verification_method='第二阶段开启时由系统立即结算并标记完成。'
where mission_code='P2-LUCKY-001';

create or replace function settle_phase_two_lucky(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_profile phase_two_profiles%rowtype;
  v_assignment_id uuid;
  v_initial_lucky boolean:=false;
  v_awarded integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-lucky-settlement-v2'));
  select * into v_profile from phase_two_profiles where primary_mission='SUPER_LUCKY' for update;
  if not found or v_profile.unlocked_at is null or v_profile.lucky_bonus_settled_at is not null then return 0; end if;

  select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
  where a.guest_id=v_profile.guest_id and t.mission_code='P2-LUCKY-001' limit 1 for update of a;
  if v_assignment_id is null then raise exception using errcode='P0001',message='phase_two_assignment_missing'; end if;

  select exists(select 1 from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_profile.guest_id and a.is_initial and t.mission_code='P1-BONUS-001')
  into v_initial_lucky;
  v_awarded:=greatest(coalesce(v_profile.phase_one_points_snapshot,0),0)+case when v_initial_lucky then 2 else 0 end;

  if v_awarded>0 then
    update guests set points=points+v_awarded where id=v_profile.guest_id;
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_profile.guest_id,v_assignment_id,v_awarded,
      case when v_initial_lucky then '丘比特幸运星 · 第一阶段积分翻倍并追加幸运奖励'
        else '丘比特幸运星 · 第一阶段积分翻倍' end,p_actor);
  end if;
  update phase_two_profiles set lucky_bonus_settled_at=now(),updated_at=now()
  where guest_id=v_profile.guest_id;
  update assignments set status='approved',approved_at=coalesce(approved_at,now()),
    verified_at=coalesce(verified_at,now()),verification_note='第二阶段开启时已由系统立即结算'
  where id=v_assignment_id and status<>'approved';
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.lucky_settle','guest',v_profile.guest_id::text,jsonb_build_object(
    'snapshot_points',v_profile.phase_one_points_snapshot,'initial_lucky_bonus',case when v_initial_lucky then 2 else 0 end,
    'awarded',v_awarded,'settled_immediately',true));
  return v_awarded;
end;
$$;

create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if not exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where t.stage='task_round_2' and t.mission_code like 'P2-%') then
    delete from phase_two_dilemmas;
    delete from phase_two_copy_choices;
  end if;
  v_count:=unlock_phase_two_missions_assignments_v1(p_actor);
  perform settle_phase_two_lucky(p_actor);
  return v_count;
end;
$$;

revoke all on function settle_phase_two_lucky(text) from public,anon,authenticated;
revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
grant execute on function settle_phase_two_lucky(text) to service_role;
grant execute on function unlock_phase_two_missions(text) to service_role;

-- Forward-fix an already unlocked production round without changing any other
-- assignment or replaying the allocation.
select settle_phase_two_lucky('migration:202607310028');

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310028','phase_two.final_polish','game_state','1',jsonb_build_object(
  'existing_runtime_preserved',true,'lucky_settlement','immediate','clue_groups_added',true));

commit;
