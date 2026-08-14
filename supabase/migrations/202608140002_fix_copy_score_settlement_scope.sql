-- Keep the Lonely Cupid promise literal: copy only points backed by an
-- official second-round assignment.  Operator adjustments and voting rewards
-- have no assignment_id and therefore never leak into the copied score.
-- Settle the captain first so choosing the Guiding Star copies the earned
-- second-round captain reward instead of observing a stale zero.

begin;

create or replace function settle_phase_two_copy_and_captain(p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
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

  -- The captain reward is itself an official P2 assignment result.  It must be
  -- durable before a possible Lonely Cupid target is measured.
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

  select * into v_copy_profile
  from phase_two_profiles
  where primary_mission='COPY_SCORE'
  for update;
  if found then
    select * into v_copy
    from phase_two_copy_choices
    where guest_id=v_copy_profile.guest_id
    for update;
    if found and v_copy.settled_at is null then
      select * into v_target_profile
      from phase_two_profiles
      where guest_id=v_copy.target_guest_id;
      if not found then
        raise exception using errcode='P0001',message='phase_two_copy_target_invalid';
      end if;

      select coalesce(sum(l.amount),0)::integer into v_copy_points
      from points_ledger l
      join assignments source_assignment on source_assignment.id=l.assignment_id
      join tasks source_task on source_task.id=source_assignment.task_id
      where l.guest_id=v_copy.target_guest_id
        and l.created_at>=v_target_profile.unlocked_at
        and source_task.stage='task_round_2'
        and is_official_wedding_mission_code(source_task.mission_code)
        and source_task.mission_code not in('P2-LONELY-001','P2-LUCKY-001');

      if v_copy_points>0 then
        select a.id into v_assignment_id
        from assignments a
        join tasks t on t.id=a.task_id
        where a.guest_id=v_copy_profile.guest_id and t.mission_code='P2-LONELY-001'
        limit 1;
        if v_assignment_id is null then
          raise exception using errcode='P0001',message='phase_two_assignment_missing';
        end if;
        insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
        values(v_copy_profile.guest_id,v_assignment_id,v_copy_points,'孤单丘比特 · 命运复制',p_actor);
        update guests set points=points+v_copy_points where id=v_copy_profile.guest_id;
      end if;
      update phase_two_copy_choices
      set settled_points=v_copy_points,settled_at=now()
      where guest_id=v_copy_profile.guest_id;
      update assignments
      set status='approved',approved_at=now(),verified_at=now(),
        verification_note='命运复制已由系统结算'
      where guest_id=v_copy_profile.guest_id
        and task_id=(select id from tasks where mission_code='P2-LONELY-001');
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.personal_settle','game_state','1',jsonb_build_object(
    'copy_points',v_copy_points,'captain_points',v_captain_points,
    'copy_scope','official_phase_two_assignment_ledger','captain_settled_first',true));
  return jsonb_build_object('copy_points',v_copy_points,'captain_points',v_captain_points);
end;
$$;

revoke all on function settle_phase_two_copy_and_captain(text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608140002','phase_two.copy_score_scope_fixed','game_state','1',jsonb_build_object(
  'forward_only',true,'official_phase_two_assignment_points_only',true,
  'manual_points_excluded',true,'vote_rewards_excluded',true,
  'lucky_multiplier_excluded',true,'captain_settled_before_copy',true));

commit;
