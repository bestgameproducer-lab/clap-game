-- The older phase-two allocator selected both EXTRA_VOTE profiles from one
-- global random pool. The formal 20-player contract requires exactly one per
-- competitive team, so that implementation could intermittently abort the
-- ceremony-end -> dinner-prelude transition. Replace only the future
-- allocation function; no current assignments or profile rows are touched.

begin;

create or replace function unlock_phase_two_missions_assignments_v1(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing integer;
  v_team text;
  v_task_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-unlock-v3'));

  select count(*)::integer into v_existing
  from assignments a
  join tasks t on t.id=a.task_id
  where a.status<>'cancelled'
    and t.stage='task_round_2'
    and t.mission_code like 'P2-%';
  if v_existing>0 then return v_existing; end if;

  -- There are exactly ten eligible, drawn app accounts in each competitive
  -- team, and exactly one visible trickster per team. Family and principals
  -- never enter this allocator.
  if (select count(*) from guests
      where active and uses_app and participation_mode='ACTIVE_PLAYER'
        and phase_two_eligible and drawn_at is not null and not is_hidden_spy)<>20
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and not is_hidden_spy
            and team='海岛组')<>10
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and not is_hidden_spy
            and team='沙漠组')<>10
      or exists(
        select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
        where (select count(*) from guests g
          where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
            and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
            and g.team=expected.team and g.role='spy')<>1
      ) then
    raise exception using errcode='P0001',message='phase_two_roster_not_ready';
  end if;

  if (select count(*) from guests
      where active and uses_app and participation_mode='ACTIVE_PLAYER'
        and phase_two_eligible and drawn_at is not null and unlocked_role='CUPID_ALLIANCE')<>4
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='STAR_ALLIANCE')<>4
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='LONELY_CUPID')<>1
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='GUIDING_STAR')<>1 then
    raise exception using errcode='P0001',message='phase_two_relationship_roles_not_ready';
  end if;

  delete from phase_two_profiles where true;

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'TRICKSTER',false,false,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and g.role='spy';

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'DINNER_SPEECH',false,false,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and lower(g.login_name)='yirui zhang' and g.role='guest';
  if not found then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable';
  end if;

  -- The relationship outcome, not a profile preset or any previous browser
  -- state, is the sole source of the two awakening roles and the two dilemmas.
  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,
    case g.unlocked_role
      when 'CUPID_ALLIANCE' then 'HEART_DILEMMA'
      when 'STAR_ALLIANCE' then 'STAR_DILEMMA'
      when 'LONELY_CUPID' then 'COPY_SCORE'
      when 'GUIDING_STAR' then 'TEAM_CAPTAIN'
    end,
    false,false,g.unlocked_role='GUIDING_STAR','',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and g.unlocked_role in('CUPID_ALLIANCE','STAR_ALLIANCE','LONELY_CUPID','GUIDING_STAR')
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id);

  -- One extra-vote profile must be chosen from each team. Prefer a guest who
  -- already had a first-act photo, which preserves the no-repeat-photo rule,
  -- but never sacrifice the one-per-team invariant to that preference.
  foreach v_team in array array['海岛组','沙漠组'] loop
    insert into phase_two_profiles(
      guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
      interaction_theme,phase_one_points_snapshot,updated_at
    )
    select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now()
    from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and g.team=v_team
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
    order by exists(
      select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=g.id and a.is_initial
        and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
    ) desc,random()
    limit 1;
    if not found then
      raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable';
    end if;
  end loop;

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'SUPER_LUCKY',false,true,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
  order by exists(
    select 1 from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=g.id and a.is_initial
      and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
  ) desc,random()
  limit 1;
  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;

  -- The four photography missions are assigned only to the remaining players
  -- without either first-act photo. At this point exactly four such profiles
  -- must remain; failure is a controlled release error, never a bad task.
  with candidates as (
    select g.id,row_number() over(order by random()) as position
    from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
      and not exists(
        select 1 from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=g.id and a.is_initial
          and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
      )
  ), missions(position,primary_mission,interaction_theme) as (values
    (1,'TOAST_GROOM_FATHER',''),
    (2,'TOAST_BRIDE_MOTHER',''),
    (3,'INTERACT_WITH_GROOM','与新郎完成一张有故事感的合影'),
    (4,'INTERACT_WITH_BRIDE','与新娘完成一张有故事感的合影')
  )
  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,m.primary_mission,false,false,false,m.interaction_theme,g.points,now()
  from candidates c
  join missions m using(position)
  join guests g on g.id=c.id;

  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>1
      or exists(
        select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
        where (select count(*) from phase_two_profiles p
          where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
          or (select count(*) from phase_two_profiles p
            where p.team=expected.team and p.primary_mission='EXTRA_VOTE')<>1
      )
      or exists(
        select 1 from phase_two_profiles p
        where p.primary_mission in(
          'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'
        ) and exists(
          select 1 from assignments a join tasks t on t.id=a.task_id
          where a.guest_id=p.guest_id and a.is_initial
            and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
        )
      ) then
    raise exception using errcode='P0001',message='phase_two_coverage_invalid';
  end if;

  insert into assignments(guest_id,task_id)
  select p.guest_id,t.id
  from phase_two_profiles p
  join tasks t on t.mission_code=case p.primary_mission
    when 'TOAST_GROOM_FATHER' then 'P2-SOCIAL-001'
    when 'TOAST_BRIDE_MOTHER' then 'P2-SOCIAL-002'
    when 'INTERACT_WITH_GROOM' then 'P2-SOCIAL-003'
    when 'INTERACT_WITH_BRIDE' then 'P2-SOCIAL-004'
    when 'DINNER_SPEECH' then 'P2-CEREMONY-001'
    when 'HEART_DILEMMA' then 'P2-HEART-001'
    when 'STAR_DILEMMA' then 'P2-STAR-001'
    when 'COPY_SCORE' then 'P2-LONELY-001'
    when 'TEAM_CAPTAIN' then 'P2-GUIDE-001'
    when 'TRICKSTER' then 'P2-TRICKSTER-001'
    when 'EXTRA_VOTE' then 'P2-POWER-001'
    when 'SUPER_LUCKY' then 'P2-LUCKY-001'
  end
  where t.active and not t.is_demo and t.stage='task_round_2'
  on conflict(guest_id,task_id) do nothing;
  get diagnostics v_task_count=row_count;
  if v_task_count<>20 then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;

  update phase_two_profiles set unlocked_at=now(),updated_at=now() where true;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'mission.phase_two_unlock','game_state','1',jsonb_build_object(
    'assignments_created',v_task_count,
    'official_assignment_set',true,
    'one_extra_vote_per_team',true,
    'relationship_origin_only',true,
    'repeat_photo_excluded',true
  ));
  return v_task_count;
end;
$$;

revoke all on function unlock_phase_two_missions_assignments_v1(text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130032','phase_two.allocator_team_safe','game_state','1',jsonb_build_object(
  'previous_global_extra_vote_randomness_replaced',true,
  'one_extra_vote_per_competitive_team',true,
  'phase_two_profiles_untouched_until_next_release',true
));

commit;
