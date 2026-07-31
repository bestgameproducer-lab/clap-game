-- Keep every phase-one photo recipient out of phase-two photo missions.
-- Existing unlocked phase-two rows are preserved; this affects the next atomic unlock.

begin;

create or replace function unlock_phase_two_missions_assignments_v1(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer; v_team text; v_task_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-unlock-v2'));
  select count(*) into v_count from assignments a join tasks t on t.id=a.task_id
  where t.stage='task_round_2' and t.mission_code like 'P2-%';
  if v_count>0 then return v_count; end if;

  if (select count(*) from guests where active and phase_two_eligible and drawn_at is not null)<>20
      or (select count(*) from guests where active and phase_two_eligible and team='海岛组' and drawn_at is not null)<>10
      or (select count(*) from guests where active and phase_two_eligible and team='沙漠组' and drawn_at is not null)<>10 then
    raise exception using errcode='P0001',message='phase_two_roster_not_ready';
  end if;
  if exists(select 1 from(values('海岛组'),('沙漠组')) expected(team) where
      (select count(*) from guests g where g.active and g.phase_two_eligible and g.drawn_at is not null
        and g.team=expected.team and g.role='spy')<>1) then
    raise exception using errcode='P0001',message='phase_two_trickster_count_invalid';
  end if;
  if (select count(*) from guests where active and phase_two_eligible and drawn_at is not null and unlocked_role='CUPID_ALLIANCE')<>4
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null and unlocked_role='STAR_ALLIANCE')<>4
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null and unlocked_role='LONELY_CUPID')<>1
      or (select count(*) from guests where active and phase_two_eligible and drawn_at is not null and unlocked_role='GUIDING_STAR')<>1 then
    raise exception using errcode='P0001',message='phase_two_relationship_roles_not_ready';
  end if;

  delete from phase_two_profiles;
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,'TRICKSTER',false,false,false,'',points,now() from guests
  where active and phase_two_eligible and drawn_at is not null and role='spy';
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,'DINNER_SPEECH',false,false,false,'',points,now() from guests
  where active and phase_two_eligible and drawn_at is not null and lower(login_name)='yirui zhang' and role<>'spy';
  if not found then raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable'; end if;
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select id,team,case unlocked_role when 'CUPID_ALLIANCE' then 'HEART_DILEMMA'
      when 'STAR_ALLIANCE' then 'STAR_DILEMMA' when 'LONELY_CUPID' then 'COPY_SCORE'
      when 'GUIDING_STAR' then 'TEAM_CAPTAIN' end,false,false,unlocked_role='GUIDING_STAR','',points,now()
  from guests where active and phase_two_eligible and drawn_at is not null
    and unlocked_role in('CUPID_ALLIANCE','STAR_ALLIANCE','LONELY_CUPID','GUIDING_STAR')
    and not exists(select 1 from phase_two_profiles p where p.guest_id=guests.id);

  -- The three non-photo power cards absorb prior photo recipients first.
  with candidates as(
    select g.id,row_number() over(order by exists(
      select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=g.id
        and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')) desc,random()) n
    from guests g where g.active and g.phase_two_eligible and g.drawn_at is not null
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id) limit 2)
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now() from candidates c join guests g on g.id=c.id;
  if (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2 then
    raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable';
  end if;

  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,'SUPER_LUCKY',false,true,false,'',g.points,now() from guests g
  where g.active and g.phase_two_eligible and g.drawn_at is not null
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
  order by exists(select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=g.id
    and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')) desc,random() limit 1;
  if not found then raise exception using errcode='P0001',message='phase_two_lucky_unavailable'; end if;

  with remaining as(
    select g.id,row_number() over(order by random()) n from guests g
    where g.active and g.phase_two_eligible and g.drawn_at is not null
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
      and not exists(select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=g.id
        and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')) limit 4
  ),missions(n,mission) as(values
    (1,'TOAST_GROOM_FATHER'),(2,'TOAST_BRIDE_MOTHER'),(3,'INTERACT_WITH_GROOM'),(4,'INTERACT_WITH_BRIDE'))
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,m.mission,false,false,false,case m.mission
    when 'INTERACT_WITH_GROOM' then '与新郎完成一张有故事感的合影'
    when 'INTERACT_WITH_BRIDE' then '与新娘完成一张有故事感的合影' else '' end,g.points,now()
  from remaining r join missions m using(n) join guests g on g.id=r.id;

  foreach v_team in array array['海岛组','沙漠组'] loop
    if not exists(select 1 from phase_two_profiles where team=v_team and is_captain) then
      update phase_two_profiles set is_captain=true,updated_at=now() where guest_id=(
        select guest_id from phase_two_profiles where team=v_team and primary_mission<>'TRICKSTER' order by random() limit 1);
    end if;
  end loop;
  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission in('TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'))<>4
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>1 then
    raise exception using errcode='P0001',message='phase_two_coverage_invalid';
  end if;
  if exists(select 1 from phase_two_profiles p where p.primary_mission in(
      'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE')
      and exists(select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=p.guest_id
        and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002'))) then
    raise exception using errcode='P0001',message='phase_two_repeat_photo_assignment';
  end if;
  if exists(select 1 from(values('海岛组'),('沙漠组')) expected(team) where
      (select count(*) from phase_two_profiles p where p.team=expected.team)<>10
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
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
    'assignments_created',v_task_count,'exclusive_coverage',20,'fixed_speech','Yirui Zhang','repeat_photo_excluded',true));
  return v_task_count;
end;
$$;

revoke all on function unlock_phase_two_missions_assignments_v1(text) from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310004','phase_two.photo_exclusion','game_state','1',jsonb_build_object(
  'phase_one_photo_codes',jsonb_build_array('P1-SOCIAL-001','P1-SOCIAL-002'),'runtime_preserved',true));

commit;
