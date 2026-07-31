-- Add private, immutable phase-two choices and idempotent personal settlement.

begin;

alter table phase_two_profiles add column if not exists captain_bonus_settled_at timestamptz;

-- Wrap the existing assignment generator so a future rehearsal reset can safely
-- reuse the phase-two choice tables without rewriting the applied reset migration.
alter function unlock_phase_two_missions(text) rename to unlock_phase_two_missions_assignments_v1;
create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where t.stage='task_round_2' and t.mission_code like 'P2-%') then
    delete from phase_two_dilemmas;
    delete from phase_two_copy_choices;
  end if;
  return unlock_phase_two_missions_assignments_v1(p_actor);
end;
$$;

create or replace function submit_phase_two_dilemma(p_guest_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state game_state%rowtype;
  v_profile phase_two_profiles%rowtype;
  v_relation player_relationships%rowtype;
  v_row phase_two_dilemmas%rowtype;
  v_type text;
  v_a uuid;
  v_b uuid;
  v_a_points integer;
  v_b_points integer;
  v_a_assignment_id uuid;
  v_b_assignment_id uuid;
begin
  select * into v_state from game_state where id=1 for share;
  if v_state.stage not in ('task_round_2','group_game') then
    raise exception using errcode='P0001',message='phase_two_action_closed';
  end if;
  select * into v_profile from phase_two_profiles where guest_id=p_guest_id and unlocked_at is not null;
  if not found or v_profile.primary_mission not in ('HEART_DILEMMA','STAR_DILEMMA') then
    raise exception using errcode='P0001',message='phase_two_dilemma_forbidden';
  end if;
  v_type:=case v_profile.primary_mission when 'HEART_DILEMMA' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
  if (v_type='CUPID_ALLIANCE' and p_choice not in ('LOVE','HATE'))
      or (v_type='STAR_ALLIANCE' and p_choice not in ('TOGETHER','TAKE_ALL')) then
    raise exception using errcode='22023',message='invalid_phase_two_choice';
  end if;
  select * into v_relation from player_relationships where relationship_type=v_type and status='ACTIVE'
    and p_guest_id in (player_a_id,player_b_id) limit 1;
  if not found then raise exception using errcode='P0001',message='phase_two_alliance_missing'; end if;
  v_a:=least(v_relation.player_a_id,v_relation.player_b_id);
  v_b:=greatest(v_relation.player_a_id,v_relation.player_b_id);
  insert into phase_two_dilemmas(alliance_type,player_a_id,player_b_id)
  values(case when v_type='CUPID_ALLIANCE' then 'HEART' else 'STAR' end,v_a,v_b)
  on conflict do nothing;
  select * into v_row from phase_two_dilemmas
  where player_a_id=v_a and player_b_id=v_b for update;
  if v_row.settled_at is not null
      or (p_guest_id=v_row.player_a_id and v_row.player_a_choice is not null)
      or (p_guest_id=v_row.player_b_id and v_row.player_b_choice is not null) then
    raise exception using errcode='P0001',message='phase_two_choice_locked';
  end if;
  if p_guest_id=v_row.player_a_id then
    update phase_two_dilemmas set player_a_choice=p_choice where id=v_row.id returning * into v_row;
  else
    update phase_two_dilemmas set player_b_choice=p_choice where id=v_row.id returning * into v_row;
  end if;
  if v_row.player_a_choice is not null and v_row.player_b_choice is not null then
    select a.id into v_a_assignment_id from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_row.player_a_id and t.mission_code in ('P2-HEART-001','P2-STAR-001') limit 1;
    select a.id into v_b_assignment_id from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_row.player_b_id and t.mission_code in ('P2-HEART-001','P2-STAR-001') limit 1;
    if v_a_assignment_id is null or v_b_assignment_id is null then
      raise exception using errcode='P0001',message='phase_two_assignment_missing';
    end if;
    if v_row.player_a_choice in ('LOVE','TOGETHER') and v_row.player_b_choice in ('LOVE','TOGETHER') then
      v_a_points:=3; v_b_points:=3;
    elsif v_row.player_a_choice in ('LOVE','TOGETHER') and v_row.player_b_choice in ('HATE','TAKE_ALL') then
      v_a_points:=0; v_b_points:=5;
    elsif v_row.player_a_choice in ('HATE','TAKE_ALL') and v_row.player_b_choice in ('LOVE','TOGETHER') then
      v_a_points:=5; v_b_points:=0;
    else
      v_a_points:=1; v_b_points:=1;
    end if;
    update phase_two_dilemmas set player_a_points=v_a_points,player_b_points=v_b_points,settled_at=now()
    where id=v_row.id returning * into v_row;
    if v_a_points>0 then
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_row.player_a_id,v_a_assignment_id,v_a_points,'第二阶段联盟秘密选择','system:phase-two-dilemma');
      update guests set points=points+v_a_points where id=v_row.player_a_id;
    end if;
    if v_b_points>0 then
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_row.player_b_id,v_b_assignment_id,v_b_points,'第二阶段联盟秘密选择','system:phase-two-dilemma');
      update guests set points=points+v_b_points where id=v_row.player_b_id;
    end if;
    update assignments set status='approved',approved_at=now(),verified_at=now(),
      verification_note='双方秘密选择已由系统结算'
    where guest_id in(v_row.player_a_id,v_row.player_b_id) and task_id in(
      select id from tasks where mission_code in ('P2-HEART-001','P2-STAR-001'));
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'phase_two.dilemma_submit','phase_two_dilemma',v_row.id::text,
    jsonb_build_object('alliance_type',v_row.alliance_type,'settled',v_row.settled_at is not null));
  return jsonb_build_object('submitted',true,'settled',v_row.settled_at is not null);
end;
$$;

create or replace function submit_phase_two_copy_choice(p_guest_id uuid,p_target_guest_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype; v_profile phase_two_profiles%rowtype; v_target phase_two_profiles%rowtype;
begin
  if p_guest_id=p_target_guest_id then raise exception using errcode='22023',message='phase_two_copy_self'; end if;
  select * into v_state from game_state where id=1 for share;
  if v_state.stage not in ('task_round_2','group_game') then
    raise exception using errcode='P0001',message='phase_two_action_closed';
  end if;
  select * into v_profile from phase_two_profiles where guest_id=p_guest_id and unlocked_at is not null;
  if not found or v_profile.primary_mission<>'COPY_SCORE' then
    raise exception using errcode='P0001',message='phase_two_copy_forbidden';
  end if;
  select * into v_target from phase_two_profiles where guest_id=p_target_guest_id and unlocked_at is not null;
  if not found or v_target.primary_mission='COPY_SCORE' then
    raise exception using errcode='P0001',message='phase_two_copy_target_invalid';
  end if;
  begin
    insert into phase_two_copy_choices(guest_id,target_guest_id) values(p_guest_id,p_target_guest_id);
  exception when unique_violation then raise exception using errcode='P0001',message='phase_two_choice_locked'; end;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'phase_two.copy_submit','guest',p_guest_id::text,
    jsonb_build_object('target_guest_id',p_target_guest_id));
end;
$$;

create or replace function settle_phase_two_copy_and_captain(p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_copy phase_two_copy_choices%rowtype;
  v_copy_profile phase_two_profiles%rowtype;
  v_target_profile phase_two_profiles%rowtype;
  v_copy_points integer:=0;
  v_assignment_id uuid;
  v_top_team_score integer;
  v_captain phase_two_profiles%rowtype;
  v_captain_points integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-personal-settlement-v1'));
  select * into v_copy_profile from phase_two_profiles where primary_mission='COPY_SCORE' for update;
  if found then
    select * into v_copy from phase_two_copy_choices where guest_id=v_copy_profile.guest_id for update;
    if found and v_copy.settled_at is null then
      select * into v_target_profile from phase_two_profiles where guest_id=v_copy.target_guest_id;
      select coalesce(sum(l.amount),0)::integer into v_copy_points from points_ledger l
      where l.guest_id=v_copy.target_guest_id and l.created_at>=v_target_profile.unlocked_at
        and l.reason<>'超级幸运星 · 第一阶段积分翻倍';
      if v_copy_points>0 then
        select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=v_copy_profile.guest_id and t.mission_code='P2-LONELY-001' limit 1;
        insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
        values(v_copy_profile.guest_id,v_assignment_id,v_copy_points,'孤单丘比特 · 命运复制',p_actor);
        update guests set points=points+v_copy_points where id=v_copy_profile.guest_id;
      end if;
      update phase_two_copy_choices set settled_points=v_copy_points,settled_at=now()
      where guest_id=v_copy_profile.guest_id;
      update assignments set status='approved',approved_at=now(),verified_at=now(),verification_note='命运复制已由系统结算'
      where guest_id=v_copy_profile.guest_id and task_id=(select id from tasks where mission_code='P2-LONELY-001');
    end if;
  end if;

  select max(score) into v_top_team_score from(
    select team,coalesce(sum(amount),0)::integer score from team_points_ledger
    where team in('海岛组','沙漠组') group by team) totals;
  select * into v_captain from phase_two_profiles where primary_mission='TEAM_CAPTAIN' for update;
  if found and v_captain.captain_bonus_settled_at is null then
    if coalesce(v_top_team_score,0)>0 and
        (select coalesce(sum(amount),0) from team_points_ledger where team=v_captain.team)=v_top_team_score then
      select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_captain.guest_id and t.mission_code='P2-GUIDE-001' limit 1;
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_captain.guest_id,v_assignment_id,4,'领航星队长 · 团队第一',p_actor);
      update guests set points=points+4 where id=v_captain.guest_id;
      v_captain_points:=4;
    end if;
    update phase_two_profiles set captain_bonus_settled_at=now(),updated_at=now() where guest_id=v_captain.guest_id;
    update assignments set status='approved',approved_at=now(),verified_at=now(),
      verification_note=case when v_captain_points=4 then '所在团队获得第一，系统奖励 4 分' else '团队排名已结算' end
    where guest_id=v_captain.guest_id and task_id=(select id from tasks where mission_code='P2-GUIDE-001');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.personal_settle','game_state','1',jsonb_build_object(
    'copy_points',v_copy_points,'captain_points',v_captain_points));
  return jsonb_build_object('copy_points',v_copy_points,'captain_points',v_captain_points);
end;
$$;

-- Append copy/captain settlement to the existing final reward boundary without
-- duplicating its weighted-vote and lucky-star implementation.
alter function settle_voting_results(integer,text) rename to settle_voting_results_with_lucky_v1;
create or replace function settle_voting_results(p_voting_round integer,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_phase_two jsonb;
begin
  v_result:=settle_voting_results_with_lucky_v1(p_voting_round,p_actor);
  v_phase_two:=settle_phase_two_copy_and_captain(p_actor);
  return v_result||jsonb_build_object('phase_two',v_phase_two);
end;
$$;

revoke all on function unlock_phase_two_missions_assignments_v1(text) from public,anon,authenticated;
revoke all on function unlock_phase_two_missions_assignments_v1(text) from service_role;
revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
revoke all on function submit_phase_two_dilemma(uuid,text) from public,anon,authenticated;
revoke all on function submit_phase_two_copy_choice(uuid,uuid) from public,anon,authenticated;
revoke all on function settle_phase_two_copy_and_captain(text) from public,anon,authenticated;
revoke all on function settle_voting_results_with_lucky_v1(integer,text) from public,anon,authenticated;
revoke all on function settle_voting_results_with_lucky_v1(integer,text) from service_role;
revoke all on function settle_voting_results(integer,text) from public,anon,authenticated;
grant execute on function unlock_phase_two_missions(text) to service_role;
grant execute on function submit_phase_two_dilemma(uuid,text) to service_role;
grant execute on function submit_phase_two_copy_choice(uuid,uuid) to service_role;
grant execute on function settle_phase_two_copy_and_captain(text) to service_role;
grant execute on function settle_voting_results(integer,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310002','phase_two.player_actions','game_state','1',jsonb_build_object(
  'private_dilemmas',true,'immutable_copy_choice',true,'copy_settlement',true,
  'captain_settlement',true,'runtime_preserved',true));

commit;
