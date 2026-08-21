-- Apply the organizer-approved final competitive teams and preset tricksters.
-- This is deliberately a guarded, one-time migration: the live application
-- correctly prevents team changes once the formal roster has been launched.

begin;

do $$
declare
  v_plan jsonb := '[
    {"login_name":"Fangzhou Chen","team":"沙漠组","role":"spy"},
    {"login_name":"Yue Liu","team":"沙漠组","role":"guest"},
    {"login_name":"Zikun Zheng","team":"沙漠组","role":"guest"},
    {"login_name":"Siran Li","team":"沙漠组","role":"guest"},
    {"login_name":"Junheng Liu","team":"沙漠组","role":"guest"},
    {"login_name":"Yifan Yu","team":"沙漠组","role":"guest"},
    {"login_name":"Zixi Wang","team":"沙漠组","role":"guest"},
    {"login_name":"Qianyi Wang","team":"沙漠组","role":"guest"},
    {"login_name":"Jialai Jin","team":"沙漠组","role":"guest"},
    {"login_name":"Chulan Fan","team":"沙漠组","role":"guest"},
    {"login_name":"Huijie Huang","team":"海岛组","role":"spy"},
    {"login_name":"Yi Ren","team":"海岛组","role":"guest"},
    {"login_name":"Tianyi Shi","team":"海岛组","role":"guest"},
    {"login_name":"Feifei Xie","team":"海岛组","role":"guest"},
    {"login_name":"Wenli Xu","team":"海岛组","role":"guest"},
    {"login_name":"Tang-Ling Yeh","team":"海岛组","role":"guest"},
    {"login_name":"Yirui Zhang","team":"海岛组","role":"guest"},
    {"login_name":"Luyi Sun","team":"海岛组","role":"guest"},
    {"login_name":"Moshuang Xu","team":"海岛组","role":"guest"},
    {"login_name":"Ruochen Xu","team":"海岛组","role":"guest"}
  ]'::jsonb;
  v_state game_state%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
  select * into strict v_state from game_state where id = 1 for update;

  if v_state.task_catalog_mode <> 'live'
      or v_state.stage <> 'registration'
      or v_state.results_visible
      or v_state.scoreboard_visible then
    raise exception using errcode='P0001', message='final_roster_preset_requires_registration_stage';
  end if;

  if exists(select 1 from guests where claimed_at is not null or drawn_at is not null)
      or exists(select 1 from assignments where status <> 'cancelled')
      or exists(select 1 from guest_sessions) then
    raise exception using errcode='P0001', message='final_roster_preset_requires_clean_runtime';
  end if;

  if (select count(*) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text)) <> 20
      or (select count(distinct lower(login_name)) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text)) <> 20 then
    raise exception using errcode='22023', message='final_roster_preset_requires_20_unique_players';
  end if;

  if (select count(*) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text) where team = '海岛组') <> 10
      or (select count(*) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text) where team = '沙漠组') <> 10 then
    raise exception using errcode='22023', message='final_roster_preset_requires_10_per_team';
  end if;

  if (select count(*) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text)
      where team = '海岛组' and role = 'spy') <> 1
      or (select count(*) from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text)
      where team = '沙漠组' and role = 'spy') <> 1
      or exists(select 1 from jsonb_to_recordset(v_plan)
      as p(login_name text, team text, role text) where role not in('guest','spy')) then
    raise exception using errcode='22023', message='final_roster_preset_requires_one_spy_per_team';
  end if;

  if exists(
    select lower(g.login_name)
    from guests g
    where g.active and g.uses_app
      and g.participation_mode = 'ACTIVE_PLAYER' and g.phase_two_eligible
    except
    select lower(p.login_name)
    from jsonb_to_recordset(v_plan) as p(login_name text, team text, role text)
  ) or exists(
    select lower(p.login_name)
    from jsonb_to_recordset(v_plan) as p(login_name text, team text, role text)
    except
    select lower(g.login_name)
    from guests g
    where g.active and g.uses_app
      and g.participation_mode = 'ACTIVE_PLAYER' and g.phase_two_eligible
  ) then
    raise exception using errcode='P0001', message='final_roster_preset_player_set_mismatch';
  end if;

  if exists(
    select 1
    from jsonb_to_recordset(v_plan) as p(login_name text, team text, role text)
    join guests g on lower(g.login_name) = lower(p.login_name)
    where p.role = 'spy'
      and (g.story_role <> 'NONE' or not g.eligible_for_secret_role)
  ) then
    raise exception using errcode='P0001', message='final_roster_preset_spy_ineligible';
  end if;

  update guests g
  set team = p.team,
      role = p.role,
      team_locked = true,
      role_locked = (p.role = 'spy' or g.story_role <> 'NONE' or not g.eligible_for_secret_role),
      hidden_role = 'NONE',
      is_hidden_spy = false
  from jsonb_to_recordset(v_plan) as p(login_name text, team text, role text)
  where lower(g.login_name) = lower(p.login_name);

  if (select count(*) from guests where active and uses_app
      and participation_mode = 'ACTIVE_PLAYER' and phase_two_eligible
      and team = '海岛组') <> 10
      or (select count(*) from guests where active and uses_app
      and participation_mode = 'ACTIVE_PLAYER' and phase_two_eligible
      and team = '沙漠组') <> 10 then
    raise exception using errcode='P0001', message='final_roster_preset_team_verification_failed';
  end if;

  if (select count(*) from guests where active and uses_app
      and participation_mode = 'ACTIVE_PLAYER' and phase_two_eligible
      and team = '海岛组' and role = 'spy' and not is_hidden_spy) <> 1
      or (select count(*) from guests where active and uses_app
      and participation_mode = 'ACTIVE_PLAYER' and phase_two_eligible
      and team = '沙漠组' and role = 'spy' and not is_hidden_spy) <> 1 then
    raise exception using errcode='P0001', message='final_roster_preset_spy_verification_failed';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(
    'migration:202608210001',
    'formal_roster.team_and_trickster_preset',
    'game_state','1',
    jsonb_build_object(
      'approved_by','organizer',
      'island_spy','Huijie Huang',
      'desert_spy','Fangzhou Chen',
      'teams',v_plan,
      'guarded_clean_runtime',true
    )
  );
end
$$;

commit;
