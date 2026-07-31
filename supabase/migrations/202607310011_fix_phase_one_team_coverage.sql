-- Keep the five heart and five star roles inside the 20 competitive players.
-- The sole family player without a fixed ceremony role receives the fourth
-- scored photo slot; trickster facade photos remain unscored overlays.

begin;

create or replace function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public as $$
declare
  v_guest guests%rowtype; v_role text; v_task tasks%rowtype; v_assignment assignments%rowtype;
  v_registration_open boolean; v_drawn_spies integer; v_drawn_guests integer;
  v_reserved_guests integer; v_hidden_task_id uuid; v_random_story_role text;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v4'));
  select registration_open into v_registration_open from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' or not v_guest.eligible_for_mission then
    raise exception using errcode='P0001',message='guest_not_mission_eligible';
  end if;
  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a where a.guest_id=v_guest.id and a.is_initial order by a.created_at limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,
      v_task.description,v_task.verification_method,v_task.points,v_guest.drawn_at; return;
  end if;
  if not coalesce(v_registration_open,false) then raise exception using errcode='P0001',message='draw_registration_closed'; end if;
  if v_guest.team not in('家人组','海岛组','沙漠组') then raise exception using errcode='P0001',message='invalid_final_team'; end if;

  if v_guest.team='家人组' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or v_guest.role_locked then
    v_role:='guest';
  else
    select count(*) filter(where role='spy'),count(*) filter(where role='guest') into v_drawn_spies,v_drawn_guests
    from guests where drawn_at is not null and team=v_guest.team;
    select count(*) into v_reserved_guests from guests g where g.id<>v_guest.id and g.active and g.phase_two_eligible
      and g.drawn_at is null and g.team=v_guest.team
      and (g.story_role<>'NONE' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest'));
    select role_name into v_role from(
      select 'spy'::text role_name from generate_series(1,greatest(0,1-v_drawn_spies))
      union all select 'guest'::text from generate_series(1,greatest(0,9-v_drawn_guests-v_reserved_guests))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' then
    select * into v_task from tasks where active and not is_demo and mission_code=case v_guest.story_role
      when 'OFFICIANT' then 'P1-CER-001' when 'RING_KEEPER' then 'P1-CER-002'
      when 'GROOM_CHEERLEADER' then 'P1-CER-003' when 'BRIDE_CHEERLEADER' then 'P1-CER-004'
      when 'HEART_HOLDER' then 'P1-HEART-001' when 'STAR_HOLDER' then 'P1-STAR-001' else null end limit 1;
  elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-BONUS-001' limit 1;
  elsif v_role='spy' then
    select * into v_task from tasks where active and not is_demo and mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') order by random() limit 1;
  else
    select * into v_task from tasks t where t.active and not t.is_demo and (
      (v_guest.phase_two_eligible and t.mission_code='P1-HEART-001' and
        (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
          where a.task_id=t.id and a.is_initial and assigned_guest.phase_two_eligible)
        +(select count(*) from guests reserved where reserved.id<>v_guest.id and reserved.active
          and reserved.phase_two_eligible and reserved.drawn_at is null and reserved.story_role='HEART_HOLDER')<5)
      or (v_guest.phase_two_eligible and t.mission_code='P1-STAR-001' and
        (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
          where a.task_id=t.id and a.is_initial and assigned_guest.phase_two_eligible)
        +(select count(*) from guests reserved where reserved.id<>v_guest.id and reserved.active
          and reserved.phase_two_eligible and reserved.drawn_at is null and reserved.story_role='STAR_HOLDER')<5)
      or (t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') and (
        (v_guest.phase_two_eligible and
          (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
            where a.task_id=t.id and a.is_initial and assigned_guest.role='guest' and assigned_guest.phase_two_eligible)<
          case when t.mission_code='P1-SOCIAL-001' then 2 else 1 end)
        or (not v_guest.phase_two_eligible and v_guest.team='家人组' and
          (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
            where a.task_id=t.id and a.is_initial and assigned_guest.role='guest' and not assigned_guest.phase_two_eligible)<
          case when t.mission_code='P1-SOCIAL-002' then 1 else 0 end)
      ))
    ) order by random() limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  v_random_story_role:=case v_task.mission_code
    when 'P1-HEART-001' then 'HEART_HOLDER'
    when 'P1-STAR-001' then 'STAR_HOLDER'
    else v_guest.story_role end;
  update guests set role=v_role,story_role=v_random_story_role,drawn_at=now()
  where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;
  if v_guest.story_role in('HEART_HOLDER','STAR_HOLDER') then
    insert into symbol_pairing_assignments(guest_id,symbol,status)
    values(v_guest.id,case when v_guest.story_role='HEART_HOLDER' then 'HEART' else 'STAR' end,'AVAILABLE')
    on conflict(guest_id) do update set symbol=excluded.symbol,status='AVAILABLE',partner_guest_id=null,
      pending_relationship_id=null,finalized_at=null,updated_at=now();
  end if;
  if v_role='spy' then
    select id into v_hidden_task_id from tasks where mission_code='P1-TRICKSTER-001' and active and not is_demo;
    if v_hidden_task_id is null then raise exception using errcode='P0001',message='draw_task_missing'; end if;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false)
    on conflict on constraint assignments_guest_id_task_id_key do nothing;
  end if;
  if v_task.mechanic='INSTANT_BONUS' then
    perform complete_system_mission(v_guest.id,'INSTANT_BONUS','system:instant-bonus','丘比特幸运星自动奖励');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,jsonb_build_object(
    'team',v_guest.team,'role',v_role,'story_role',v_guest.story_role,'assignment_id',v_assignment.id,
    'mission_code',v_task.mission_code,'task_catalog_mode','phase-one-live-team-safe'));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,
    v_task.description,v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310011','phase_one.team_coverage_fixed','game_state','1',jsonb_build_object(
  'competitive_hearts',5,'competitive_stars',5,'competitive_scored_photos',3,
  'family_scored_photos',1,'existing_draws_preserved',true));

commit;
