-- Keep the production roster, fixed cast, team split, and allocator-owned
-- phase-two profiles from drifting after the wedding has started.

begin;

create or replace function assert_formal_configuration_editable()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_state.task_catalog_mode<>'live' then
    return;
  end if;
  if v_state.registration_open or v_state.stage<>'registration'
      or exists(
        select 1 from guests
        where active and uses_app and (claimed_at is not null or drawn_at is not null)
      ) then
    raise exception using errcode='P0001',message='formal_configuration_locked';
  end if;
end;
$$;

revoke all on function assert_formal_configuration_editable()
  from public,anon,authenticated,service_role;

create or replace function configure_guest_game_profile(
  p_guest_id uuid,p_team text,p_role text,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_mode text;
  v_guest guests%rowtype;
begin
  perform assert_wedding_not_final();
  select task_catalog_mode into v_mode from game_state where id=1;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_mode<>'live' then
    perform configure_guest_game_profile_before_final_lock(
      p_guest_id,p_team,p_role,p_actor
    );
    return;
  end if;

  perform assert_formal_configuration_editable();
  if trim(coalesce(p_team,'')) not in('海岛组','沙漠组') then
    raise exception using errcode='22023',message='invalid_team';
  end if;
  if p_role not in('guest','spy') then
    raise exception using errcode='22023',message='invalid_role';
  end if;

  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then
    raise exception using errcode='P0002',message='guest_not_found';
  end if;
  if v_guest.drawn_at is not null then
    raise exception using errcode='P0001',message='guest_card_already_drawn';
  end if;
  if not v_guest.uses_app or v_guest.participation_mode<>'ACTIVE_PLAYER'
      or not v_guest.phase_two_eligible or not v_guest.eligible_for_secret_role
      or v_guest.story_role<>'NONE' then
    raise exception using errcode='P0001',message='formal_profile_guest_ineligible';
  end if;
  if trim(p_team)<>v_guest.team then
    raise exception using errcode='P0001',message='formal_team_locked';
  end if;
  if p_role='spy' and exists(
    select 1 from guests g
    where g.id<>p_guest_id and g.active and g.phase_two_eligible
      and g.team=v_guest.team and g.role='spy' and not g.is_hidden_spy
      and (g.drawn_at is not null or g.role_locked)
  ) then
    raise exception using errcode='P0001',message='preset_spy_team_conflict';
  end if;

  update guests
  set role=p_role,
      role_locked=(p_role='spy'),
      team_locked=true,
      hidden_role='NONE',
      is_hidden_spy=false
  where id=p_guest_id;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(
    p_actor,'guest.formal_trickster_preset','guest',p_guest_id::text,
    jsonb_build_object(
      'team',v_guest.team,
      'role',p_role,
      'role_locked',p_role='spy',
      'team_change_allowed',false
    )
  );
end;
$$;

create or replace function configure_guest_story_role(
  p_guest_id uuid,p_story_role text,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_mode text;
begin
  perform assert_wedding_not_final();
  select task_catalog_mode into v_mode from game_state where id=1;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_mode='live' then
    raise exception using errcode='P0001',message='formal_story_cast_locked';
  end if;
  perform configure_guest_story_role_before_final_lock(
    p_guest_id,p_story_role,p_actor
  );
end;
$$;

create or replace function configure_phase_two_profile(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,p_super_lucky boolean,
  p_is_captain boolean,p_interaction_theme text,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_mode text;
begin
  perform assert_wedding_not_final();
  select task_catalog_mode into v_mode from game_state where id=1;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_mode='live' then
    raise exception using errcode='P0001',message='formal_phase_two_profile_locked';
  end if;
  perform configure_phase_two_profile_before_final_lock(
    p_guest_id,p_primary_mission,p_extra_vote,p_super_lucky,p_is_captain,
    p_interaction_theme,p_actor
  );
end;
$$;

create or replace function save_guest_roster(
  p_guest_id uuid,p_name text,p_login_name text,p_table_label text,
  p_is_elder boolean,p_ceremony_eligible boolean,p_active boolean,
  p_staff_notes text,p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
begin
  perform assert_wedding_not_final();
  perform assert_formal_configuration_editable();
  return save_guest_roster_before_final_lock(
    p_guest_id,p_name,p_login_name,p_table_label,p_is_elder,
    p_ceremony_eligible,p_active,p_staff_notes,p_actor
  );
end;
$$;

create or replace function import_guest_roster(p_rows jsonb,p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
begin
  perform assert_wedding_not_final();
  perform assert_formal_configuration_editable();
  return import_guest_roster_before_final_lock(p_rows,p_actor);
end;
$$;

revoke all on function configure_guest_game_profile(uuid,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function configure_guest_story_role(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
revoke all on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
revoke all on function import_guest_roster(jsonb,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140007',
  'formal_configuration.lifecycle_locked',
  'game_state',
  '1',
  jsonb_build_object(
    'roster_locked_after_registration_start',true,
    'formal_teams_fixed',true,
    'formal_story_cast_manifest_owned',true,
    'formal_phase_two_profiles_allocator_owned',true,
    'random_role_unlocks_role',true
  )
);

commit;
