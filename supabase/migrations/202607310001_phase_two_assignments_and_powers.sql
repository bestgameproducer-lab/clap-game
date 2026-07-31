-- Finalize the mutually exclusive 20-player phase-two assignment model.
-- Yirui already drew a rehearsal card in production. Preserve her ordinary first-act
-- assignment, retire only the zero-point trickster assignment, and reserve her as a
-- guest so the island trickster slot returns to the remaining draw pool.

begin;

alter table phase_two_profiles drop constraint if exists phase_two_profiles_primary_mission_check;
alter table phase_two_profiles add constraint phase_two_profiles_primary_mission_check
  check(primary_mission is null or primary_mission in (
    'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE',
    'DINNER_SPEECH','HEART_DILEMMA','STAR_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER',
    'EXTRA_VOTE','SUPER_LUCKY'));
alter table phase_two_profiles add column if not exists phase_one_points_snapshot integer not null default 0
  check(phase_one_points_snapshot>=0);
alter table phase_two_profiles add column if not exists lucky_bonus_settled_at timestamptz;

alter table votes add column if not exists vote_weight integer not null default 1
  check(vote_weight in (1,2));

update guests set role='guest',role_locked=true,eligible_for_secret_role=false,
  story_role='NONE',ceremony_eligible=false
where lower(login_name)='yirui zhang' and not is_hidden_spy;

update assignments set status='cancelled',rejection_reason='剧情调整：该玩家固定承担第二阶段晚宴致辞'
where guest_id=(select id from guests where lower(login_name)='yirui zhang')
  and task_id=(select id from tasks where mission_code='P1-TRICKSTER-001')
  and status<>'cancelled';

insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,is_demo,
  story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments)
values
('双重裁决','你拥有一次双重裁决：最终投票仍只选择一名本队玩家，但系统会将你的选择按两票计算。投票权重在身份揭晓前保密。','系统在最终投票时自动计算。',0,'guest','hidden','task_round_2',true,false,'NONE','P2-POWER-001','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM',2),
('超级幸运星','第二阶段统一解锁时，系统会记录你第一阶段已经获得的个人积分。最终揭晓结算时，你会获得同等分数的一次性奖励，相当于第一阶段积分翻倍。','系统在最终揭晓时自动结算，且只结算一次。',0,'guest','hidden','task_round_2',true,false,'NONE','P2-LUCKY-001','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM',1)
on conflict(mission_code) do update set title=excluded.title,description=excluded.description,
  verification_method=excluded.verification_method,points=excluded.points,active=true,is_demo=false,
  mechanic=excluded.mechanic,score_policy=excluded.score_policy,assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,max_assignments=excluded.max_assignments;

create or replace function configure_phase_two_profile(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,p_super_lucky boolean,
  p_is_captain boolean,p_interaction_theme text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.phase_two_eligible or v_guest.team not in ('海岛组','沙漠组') then
    raise exception using errcode='P0001',message='phase_two_guest_ineligible';
  end if;
  if p_primary_mission is not null and p_primary_mission not in (
    'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE',
    'DINNER_SPEECH','HEART_DILEMMA','STAR_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER',
    'EXTRA_VOTE','SUPER_LUCKY') then
    raise exception using errcode='22023',message='invalid_phase_two_mission';
  end if;
  if coalesce(p_extra_vote,false)<>(p_primary_mission='EXTRA_VOTE')
      or coalesce(p_super_lucky,false)<>(p_primary_mission='SUPER_LUCKY') then
    raise exception using errcode='22023',message='phase_two_power_must_be_exclusive';
  end if;
  if p_primary_mission='TRICKSTER' and v_guest.role<>'spy' then
    raise exception using errcode='P0001',message='phase_two_trickster_required';
  end if;
  if v_guest.role='spy' and p_primary_mission is distinct from 'TRICKSTER' then
    raise exception using errcode='P0001',message='phase_two_trickster_mission_required';
  end if;
  if lower(v_guest.login_name)='yirui zhang' and p_primary_mission is distinct from 'DINNER_SPEECH' then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_required';
  end if;
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  values(v_guest.id,v_guest.team,p_primary_mission,coalesce(p_primary_mission='EXTRA_VOTE',false),
    coalesce(p_primary_mission='SUPER_LUCKY',false),coalesce(p_is_captain,false),trim(coalesce(p_interaction_theme,'')),
    v_guest.points,now())
  on conflict(guest_id) do update set team=excluded.team,primary_mission=excluded.primary_mission,
    extra_vote=excluded.extra_vote,super_lucky=excluded.super_lucky,is_captain=excluded.is_captain,
    interaction_theme=excluded.interaction_theme,phase_one_points_snapshot=excluded.phase_one_points_snapshot,
    updated_at=now();
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.profile_configure','guest',p_guest_id::text,jsonb_build_object(
    'primary_mission',p_primary_mission,'captain',p_is_captain,'exclusive_power',
    p_primary_mission in ('EXTRA_VOTE','SUPER_LUCKY')));
end;
$$;

create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_count integer;
  v_team text;
  v_task_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-unlock-v1'));

  select count(*) into v_count from assignments a join tasks t on t.id=a.task_id
  where t.stage='task_round_2' and t.mission_code like 'P2-%';
  if v_count>0 then return v_count; end if;

  if (select count(*) from guests where active and phase_two_eligible and drawn_at is not null)<>20
      or (select count(*) from guests where active and phase_two_eligible and team='海岛组' and drawn_at is not null)<>10
      or (select count(*) from guests where active and phase_two_eligible and team='沙漠组' and drawn_at is not null)<>10 then
    raise exception using errcode='P0001',message='phase_two_roster_not_ready';
  end if;
  if exists(select 1 from (values('海岛组'),('沙漠组')) expected(team)
    where (select count(*) from guests g where g.active and g.phase_two_eligible and g.drawn_at is not null
      and g.team=expected.team and g.role='spy')<>1) then
    raise exception using errcode='P0001',message='phase_two_trickster_count_invalid';
  end if;
  if (select count(*) from guests where active and phase_two_eligible and drawn_at is not null
      and unlocked_role='CUPID_ALLIANCE')<>4
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null
      and unlocked_role='STAR_ALLIANCE')<>4
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null
      and unlocked_role='LONELY_CUPID')<>1
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null
      and unlocked_role='GUIDING_STAR')<>1 then
    raise exception using errcode='P0001',message='phase_two_relationship_roles_not_ready';
  end if;

  delete from phase_two_profiles;

  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,'TRICKSTER',false,false,false,'',points,now() from guests
  where active and phase_two_eligible and drawn_at is not null and role='spy';

  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,'DINNER_SPEECH',false,false,false,'',points,now() from guests
  where active and phase_two_eligible and drawn_at is not null and lower(login_name)='yirui zhang' and role<>'spy';
  if not found then raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable'; end if;

  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,case unlocked_role when 'CUPID_ALLIANCE' then 'HEART_DILEMMA'
      when 'STAR_ALLIANCE' then 'STAR_DILEMMA' when 'LONELY_CUPID' then 'COPY_SCORE'
      when 'GUIDING_STAR' then 'TEAM_CAPTAIN' end,
    false,false,unlocked_role='GUIDING_STAR','',points,now()
  from guests where active and phase_two_eligible and drawn_at is not null
    and unlocked_role in ('CUPID_ALLIANCE','STAR_ALLIANCE','LONELY_CUPID','GUIDING_STAR')
    and not exists(select 1 from phase_two_profiles p where p.guest_id=guests.id);

  -- Reserve one exclusive double-vote card per team before assigning the four
  -- random social missions, so random ordering cannot exhaust a team's pool.
  foreach v_team in array array['海岛组','沙漠组'] loop
    insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
      interaction_theme,phase_one_points_snapshot,updated_at)
    select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now() from guests g
    where g.active and g.phase_two_eligible and g.drawn_at is not null and g.team=v_team
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
    order by random() limit 1;
    if not found then raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable'; end if;
  end loop;

  with remaining as (
    select g.id,row_number() over(order by random()) n from guests g
    where g.active and g.phase_two_eligible and g.drawn_at is not null
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
    limit 4
  ), missions(n,mission) as (values
    (1,'TOAST_GROOM_FATHER'),(2,'TOAST_BRIDE_MOTHER'),(3,'INTERACT_WITH_GROOM'),(4,'INTERACT_WITH_BRIDE'))
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,m.mission,false,false,false,
    case m.mission when 'INTERACT_WITH_GROOM' then '与新郎完成一张有故事感的合影'
      when 'INTERACT_WITH_BRIDE' then '与新娘完成一张有故事感的合影' else '' end,
    g.points,now() from remaining r join missions m using(n) join guests g on g.id=r.id;

  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,'SUPER_LUCKY',false,true,false,'',g.points,now() from guests g
  where g.active and g.phase_two_eligible and g.drawn_at is not null
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
  order by random() limit 1;
  if not found then raise exception using errcode='P0001',message='phase_two_lucky_unavailable'; end if;

  foreach v_team in array array['海岛组','沙漠组'] loop
    if not exists(select 1 from phase_two_profiles where team=v_team and is_captain) then
      update phase_two_profiles set is_captain=true,updated_at=now() where guest_id=(
        select guest_id from phase_two_profiles where team=v_team and primary_mission<>'TRICKSTER'
        order by random() limit 1);
    end if;
  end loop;

  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission in
        ('TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'))<>4
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>1 then
    raise exception using errcode='P0001',message='phase_two_coverage_invalid';
  end if;
  if exists(select 1 from (values('海岛组'),('沙漠组')) expected(team)
    where (select count(*) from phase_two_profiles p where p.team=expected.team)<>10
       or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
       or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='EXTRA_VOTE')<>1
       or (select count(*) from phase_two_profiles p where p.team=expected.team and p.is_captain)<>1) then
    raise exception using errcode='P0001',message='phase_two_team_coverage_invalid';
  end if;

  insert into assignments(guest_id,task_id)
  select p.guest_id,t.id from phase_two_profiles p join tasks t on t.mission_code=case p.primary_mission
    when 'TOAST_GROOM_FATHER' then 'P2-SOCIAL-001' when 'TOAST_BRIDE_MOTHER' then 'P2-SOCIAL-002'
    when 'INTERACT_WITH_GROOM' then 'P2-SOCIAL-003' when 'INTERACT_WITH_BRIDE' then 'P2-SOCIAL-004'
    when 'DINNER_SPEECH' then 'P2-CEREMONY-001' when 'HEART_DILEMMA' then 'P2-HEART-001'
    when 'STAR_DILEMMA' then 'P2-STAR-001' when 'COPY_SCORE' then 'P2-LONELY-001'
    when 'TEAM_CAPTAIN' then 'P2-GUIDE-001' when 'TRICKSTER' then 'P2-TRICKSTER-001'
    when 'EXTRA_VOTE' then 'P2-POWER-001' when 'SUPER_LUCKY' then 'P2-LUCKY-001' end
  on conflict(guest_id,task_id) do nothing;
  get diagnostics v_task_count=row_count;
  if v_task_count<>20 then raise exception using errcode='P0001',message='phase_two_assignment_count_invalid'; end if;

  update phase_two_profiles set unlocked_at=now(),updated_at=now();
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'mission.phase_two_unlock','game_state','1',jsonb_build_object(
    'assignments_created',v_task_count,'exclusive_coverage',20,'fixed_speech','Yirui Zhang'));
  return v_task_count;
end;
$$;

create or replace function cast_team_vote(p_voter_guest_id uuid,p_target_guest_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_voter_team text; v_target_team text; v_weight integer:=1; v_state game_state%rowtype;
begin
  if p_voter_guest_id=p_target_guest_id then raise exception using errcode='22023',message='self_vote'; end if;
  select * into v_state from game_state where id=1 for share;
  if not coalesce(v_state.voting_open,false) then raise exception using errcode='P0001',message='voting_closed'; end if;
  select team into v_voter_team from guests where id=p_voter_guest_id and active and drawn_at is not null;
  select team into v_target_team from guests where id=p_target_guest_id and active and drawn_at is not null;
  if v_voter_team is null or v_target_team is null then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_voter_team<>v_target_team then raise exception using errcode='22023',message='cross_team_vote'; end if;
  if exists(select 1 from phase_two_profiles where guest_id=p_voter_guest_id and primary_mission='EXTRA_VOTE'
      and unlocked_at is not null) then v_weight:=2; end if;
  begin
    insert into votes(voter_guest_id,target_guest_id,voting_round,vote_weight)
    values(p_voter_guest_id,p_target_guest_id,v_state.voting_round,v_weight);
  exception when unique_violation then raise exception using errcode='P0001',message='vote_already_cast'; end;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_voter_guest_id::text,'vote.cast','vote',p_voter_guest_id::text,
    jsonb_build_object('target_id',p_target_guest_id,'voting_round',v_state.voting_round,'weighted',v_weight=2));
end;
$$;

create or replace function settle_phase_two_lucky(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_profile phase_two_profiles%rowtype; v_awarded integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-lucky-settlement-v1'));
  select * into v_profile from phase_two_profiles where primary_mission='SUPER_LUCKY' for update;
  if not found or v_profile.unlocked_at is null or v_profile.lucky_bonus_settled_at is not null then return 0; end if;
  if v_profile.phase_one_points_snapshot>0 then
    update guests set points=points+v_profile.phase_one_points_snapshot where id=v_profile.guest_id;
    insert into points_ledger(guest_id,amount,reason,actor)
    values(v_profile.guest_id,v_profile.phase_one_points_snapshot,'超级幸运星 · 第一阶段积分翻倍',p_actor);
    v_awarded:=v_profile.phase_one_points_snapshot;
  end if;
  update phase_two_profiles set lucky_bonus_settled_at=now(),updated_at=now() where guest_id=v_profile.guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.lucky_settle','guest',v_profile.guest_id::text,
    jsonb_build_object('snapshot_points',v_profile.phase_one_points_snapshot,'awarded',v_awarded));
  return v_awarded;
end;
$$;

-- Rebuild the latest voting settlement with weighted team ballots. Individual
-- detective rewards remain one point per correct player, regardless of weight.
create or replace function settle_voting_results(p_voting_round integer,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_vote record; v_team record; v_reward_id bigint; v_guest_rewards integer:=0;
  v_team_detective_rewards integer:=0; v_team_completion_rewards integer:=0; v_completion_points integer;
begin
  if p_voting_round<1 then raise exception using errcode='22023',message='voting_not_started'; end if;
  for v_vote in select v.voter_guest_id from votes v join guests target on target.id=v.target_guest_id
    where v.voting_round=p_voting_round and target.role='spy'
  loop
    v_reward_id:=null;
    insert into result_rewards(voting_round,reward_type,guest_id,amount,details)
    values(p_voting_round,'guest_detective',v_vote.voter_guest_id,1,jsonb_build_object('reason','正确找出本队恶作剧者'))
    on conflict do nothing returning id into v_reward_id;
    if v_reward_id is not null then
      update guests set points=points+1 where id=v_vote.voter_guest_id;
      insert into points_ledger(guest_id,amount,reason,actor) values(v_vote.voter_guest_id,1,'终局投票正确找出恶作剧者',p_actor);
      v_guest_rewards:=v_guest_rewards+1;
    end if;
  end loop;
  for v_team in select voter.team,sum(v.vote_weight)::integer total_votes,
      sum(v.vote_weight) filter(where target.role='spy')::integer correct_votes
    from votes v join guests voter on voter.id=v.voter_guest_id join guests target on target.id=v.target_guest_id
    where v.voting_round=p_voting_round group by voter.team
  loop
    if v_team.correct_votes*2>v_team.total_votes then
      v_reward_id:=null;
      insert into result_rewards(voting_round,reward_type,team,amount,details)
      values(p_voting_round,'team_detective',v_team.team,3,jsonb_build_object('correct_votes',v_team.correct_votes,'total_votes',v_team.total_votes))
      on conflict do nothing returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger(team,amount,reason,actor) values(v_team.team,3,'终局投票多数正确找出恶作剧者',p_actor);
        v_team_detective_rewards:=v_team_detective_rewards+1;
      end if;
    end if;
  end loop;
  for v_team in select g.team,count(*)::integer total_guests,count(*) filter(where exists(
      select 1 from assignments a where a.guest_id=g.id and a.is_initial and a.status='approved'))::integer completed_guests
    from guests g where g.drawn_at is not null group by g.team
  loop
    v_completion_points:=case when v_team.completed_guests=v_team.total_guests then 3
      when v_team.completed_guests*4>v_team.total_guests*3 then 2
      when v_team.completed_guests*2>v_team.total_guests then 1 else 0 end;
    if v_completion_points>0 then
      v_reward_id:=null;
      insert into result_rewards(voting_round,reward_type,team,amount,details)
      values(p_voting_round,'team_completion',v_team.team,v_completion_points,
        jsonb_build_object('completed_guests',v_team.completed_guests,'total_guests',v_team.total_guests))
      on conflict do nothing returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger(team,amount,reason,actor) values(v_team.team,v_completion_points,'首轮任务团队完成率奖励',p_actor);
        v_team_completion_rewards:=v_team_completion_rewards+1;
      end if;
    end if;
  end loop;
  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'guest_detective_rewards',v_guest_rewards,'team_detective_rewards',v_team_detective_rewards,
    'team_completion_rewards',v_team_completion_rewards,'weighted_ballots',true));
  return jsonb_build_object('guest_detective_rewards',v_guest_rewards,
    'team_detective_rewards',v_team_detective_rewards,'team_completion_rewards',v_team_completion_rewards);
end;
$$;

-- Keep private trickster escape scoring consistent with the weighted final tally.
create or replace function settle_spy_results(p_voting_round integer,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_spy record; v_top_team_score integer; v_reward_id bigint; v_escaped integer:=0;
  v_first_team integer:=0; v_tasks_complete integer:=0;
begin
  if p_voting_round<1 then raise exception using errcode='22023',message='voting_not_started'; end if;
  perform pg_advisory_xact_lock(hashtext('wedding-spy-final-settlement-v1'));
  select max(team_score) into v_top_team_score from(select g.team,coalesce(sum(g.points),0)::integer+
    coalesce((select sum(t.amount) from team_points_ledger t where t.team=g.team),0)::integer team_score
    from guests g where g.active and g.drawn_at is not null group by g.team) totals;
  for v_spy in select g.id,g.team,
      coalesce((select sum(v.vote_weight)::integer from votes v where v.voting_round=p_voting_round and v.target_guest_id=g.id),0) spy_votes,
      coalesce((select sum(v.vote_weight)::integer from votes v join guests voter on voter.id=v.voter_guest_id
        where v.voting_round=p_voting_round and voter.team=g.team),0) team_votes,
      coalesce((select max(candidate_votes) from(select sum(v.vote_weight)::integer candidate_votes
        from votes v join guests target on target.id=v.target_guest_id where v.voting_round=p_voting_round
        and target.team=g.team group by v.target_guest_id) vote_totals),0) top_votes,
      (coalesce((select sum(member.points) from guests member where member.active and member.drawn_at is not null and member.team=g.team),0)+
       coalesce((select sum(t.amount) from team_points_ledger t where t.team=g.team),0))::integer team_score,
      (select count(*)::integer from assignments a join tasks task on task.id=a.task_id
        where a.guest_id=g.id and task.role_scope='spy') spy_task_count,
      (select count(*)::integer from assignments a join tasks task on task.id=a.task_id
        where a.guest_id=g.id and task.role_scope='spy' and a.status='approved') approved_spy_task_count
    from guests g where g.active and g.drawn_at is not null and g.role='spy'
  loop
    if v_spy.team_votes=0 or v_spy.spy_votes<v_spy.top_votes then
      v_reward_id:=null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values(v_spy.id,3,'escaped_vote','未成为本队最高票目标','final:escaped_vote:'||v_spy.id::text,p_actor,p_voting_round)
      on conflict(source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_escaped:=v_escaped+1; end if;
    end if;
    if v_top_team_score is not null and v_top_team_score>0 and v_spy.team_score=v_top_team_score then
      v_reward_id:=null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values(v_spy.id,2,'team_first','所在队伍获得积分榜第一名','final:team_first:'||v_spy.id::text,p_actor,p_voting_round)
      on conflict(source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_first_team:=v_first_team+1; end if;
    end if;
    if v_spy.spy_task_count>0 and v_spy.approved_spy_task_count=v_spy.spy_task_count then
      v_reward_id:=null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values(v_spy.id,2,'all_spy_tasks_complete','全部已领取的间谍专属任务审核通过','final:all_spy_tasks_complete:'||v_spy.id::text,p_actor,p_voting_round)
      on conflict(source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_tasks_complete:=v_tasks_complete+1; end if;
    end if;
  end loop;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'spy_points.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'escaped_vote_rewards',v_escaped,'team_first_rewards',v_first_team,
    'all_spy_tasks_complete_rewards',v_tasks_complete,'weighted_ballots',true));
  return jsonb_build_object('escaped_vote_rewards',v_escaped,'team_first_rewards',v_first_team,
    'all_spy_tasks_complete_rewards',v_tasks_complete);
end;
$$;

revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
revoke all on function cast_team_vote(uuid,uuid) from public,anon,authenticated;
revoke all on function settle_phase_two_lucky(text) from public,anon,authenticated;
revoke all on function settle_voting_results(integer,text) from public,anon,authenticated;
revoke all on function settle_spy_results(integer,text) from public,anon,authenticated;
grant execute on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function unlock_phase_two_missions(text) to service_role;
grant execute on function cast_team_vote(uuid,uuid) to service_role;
grant execute on function settle_phase_two_lucky(text) to service_role;
grant execute on function settle_voting_results(integer,text) to service_role;
grant execute on function settle_spy_results(integer,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310001','phase_two.assignment_model','game_state','1',jsonb_build_object(
  'exclusive_ability_cards',true,'fixed_speech','Yirui Zhang','lucky_settlement','phase_one_snapshot',
  'weighted_vote',true,'runtime_preserved',true));

commit;
