-- Reserve preconfigured teams and roles before random draws, and make the
-- phase-one draw boundary match the organizer-approved mission catalogue.

begin;

update tasks
set active=false
where stage='task_round_1'
  and coalesce(mission_code,'') not in (
    'P1-CER-001','P1-CER-002','P1-CER-003','P1-CER-004','P1-CER-005',
    'P1-HEART-001','P1-STAR-001','P1-SOCIAL-001','P1-BONUS-001',
    'P1-DECOY-001','P1-DECOY-002','P1-DECOY-003','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006',
    'P1-TRICKSTER-001','P1-SPECIAL-001'
  );

update tasks t set
  points=spec.points,
  max_assignments=spec.max_assignments,
  active=true,
  is_demo=false
from (values
  ('P1-CER-001',5,1),
  ('P1-CER-002',3,2),
  ('P1-CER-003',3,1),
  ('P1-CER-004',3,1),
  ('P1-CER-005',3,2),
  ('P1-HEART-001',2,5),
  ('P1-STAR-001',2,5),
  ('P1-SOCIAL-001',2,null::integer),
  ('P1-BONUS-001',2,3),
  ('P1-DECOY-001',2,null::integer),
  ('P1-DECOY-002',2,2),
  ('P1-DECOY-003',2,2),
  ('P1-DECOY-004',2,null::integer),
  ('P1-DECOY-005',2,null::integer),
  ('P1-DECOY-006',2,null::integer),
  ('P1-TRICKSTER-001',0,null::integer),
  ('P1-SPECIAL-001',0,1)
) as spec(mission_code,points,max_assignments)
where t.mission_code=spec.mission_code;

update game_state set task_catalog_mode='live',updated_at=now() where id=1;

-- Family relationships remain available to staff, while the guest-facing
-- honor-card title uses a warm direct form of address without "男方".
update guests set
  special_card_title=case lower(login_name)
    when 'danying yang' then '亲爱的妈妈'
    when 'liying jin' then '亲爱的大姑姑'
    when 'jianjun jin' then '亲爱的婶婶'
    when 'xiaofeng jin' then '亲爱的爸爸'
    when 'wei jin' then '亲爱的小姑姑'
    else special_card_title
  end,
  special_card_body=case lower(login_name)
    when 'danying yang' then '你已经完成了最重要的任务：用爱陪伴新郎长大，并见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，接受新人和所有宾客的感谢与祝福。'
    when 'xiaofeng jin' then '你已经完成了最重要的任务：用爱陪伴新郎长大，并见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，接受新人和所有宾客的感谢与祝福。'
    when 'liying jin' then '你已经完成了最重要的任务：一路关爱并陪伴新郎成长，也见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，你的到来本身就是珍贵的祝福。'
    when 'jianjun jin' then '你已经完成了最重要的任务：一路关爱并陪伴新郎成长，也见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，你的到来本身就是珍贵的祝福。'
    when 'wei jin' then '你已经完成了最重要的任务：一路关爱并陪伴新郎成长，也见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，你的到来本身就是珍贵的祝福。'
    else special_card_body
  end
where active and participation_mode='HONOR_GUEST';

create or replace function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public as $$
declare
  v_guest guests%rowtype; v_team text; v_role text; v_task tasks%rowtype;
  v_assignment assignments%rowtype; v_capacity integer; v_registration_open boolean;
  v_hidden_task_id uuid; v_drawn_spies integer; v_drawn_guests integer;
  v_reserved_spies integer; v_reserved_guests integer; v_configured_spies integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
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
    return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,v_task.description,
      v_task.verification_method,v_task.points,v_guest.drawn_at; return;
  end if;
  if not coalesce(v_registration_open,false) then raise exception using errcode='P0001',message='draw_registration_closed'; end if;

  if v_guest.team_locked then
    v_team:=v_guest.team;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team;
    if v_team not in ('玫瑰组','月桂组','星辰组','琥珀组') or v_capacity>=8 then
      raise exception using errcode='P0001',message='draw_preset_capacity_full';
    end if;
  else
    select candidate.team_name into v_team
    from (values('玫瑰组'),('月桂组'),('星辰组'),('琥珀组')) candidate(team_name)
    where
      (select count(*) from guests g where g.drawn_at is not null and g.team=candidate.team_name)
      +(select count(*) from guests g where g.id<>v_guest.id and g.active and g.uses_app
          and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=candidate.team_name)<8
      and (
        not (v_guest.story_role<>'NONE' or v_guest.hidden_role='CUPID_HELPER' or not v_guest.eligible_for_secret_role or (v_guest.role_locked and v_guest.role='guest'))
        or (select count(*) from guests g where g.drawn_at is not null and g.team=candidate.team_name and g.role='guest')
          +(select count(*) from guests g where g.id<>v_guest.id and g.active and g.uses_app
              and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=candidate.team_name
              and (g.story_role<>'NONE' or g.hidden_role='CUPID_HELPER' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest')))<7
      )
      and (
        not (v_guest.role_locked and v_guest.role='spy')
        or (select count(*) from guests g where g.drawn_at is not null and g.team=candidate.team_name and g.role='spy')
          +(select count(*) from guests g where g.id<>v_guest.id and g.active and g.uses_app
              and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=candidate.team_name
              and g.story_role='NONE' and g.hidden_role='NONE' and g.eligible_for_secret_role and g.role_locked and g.role='spy')<1
      )
    order by
      (select count(*) from guests g where g.drawn_at is not null and g.team=candidate.team_name)
      +(select count(*) from guests g where g.id<>v_guest.id and g.active and g.uses_app
          and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=candidate.team_name),
      random()
    limit 1;
    if v_team is null then raise exception using errcode='P0001',message='draw_capacity_full'; end if;
  end if;

  select count(*) filter(where role='spy'),count(*) filter(where role='guest')
  into v_drawn_spies,v_drawn_guests from guests where drawn_at is not null and team=v_team;
  select count(*) into v_reserved_spies from guests g where g.id<>v_guest.id and g.active and g.uses_app
    and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=v_team
    and g.story_role='NONE' and g.hidden_role='NONE' and g.eligible_for_secret_role and g.role_locked and g.role='spy';
  select count(*) into v_reserved_guests from guests g where g.id<>v_guest.id and g.active and g.uses_app
    and g.participation_mode='ACTIVE_PLAYER' and g.drawn_at is null and g.team_locked and g.team=v_team
    and (g.story_role<>'NONE' or g.hidden_role='CUPID_HELPER' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest'));
  select count(*) into v_configured_spies from guests g where g.active and g.uses_app
    and g.participation_mode='ACTIVE_PLAYER' and g.story_role='NONE' and g.hidden_role='NONE'
    and g.eligible_for_secret_role and g.role_locked and g.role='spy';

  if v_guest.story_role<>'NONE' or v_guest.hidden_role='CUPID_HELPER' or not v_guest.eligible_for_secret_role then
    v_role:='guest';
    if v_drawn_guests>=7 then raise exception using errcode='P0001',message='draw_preset_role_capacity_full'; end if;
  elsif v_guest.role_locked then
    v_role:=v_guest.role;
    if v_role not in ('guest','spy') then raise exception using errcode='P0001',message='invalid_final_role'; end if;
    if (v_role='spy' and v_drawn_spies>=1) or (v_role='guest' and v_drawn_guests>=7) then
      raise exception using errcode='P0001',message='draw_preset_role_capacity_full';
    end if;
  else
    select slots.role_name into v_role from(
      select 'spy'::text role_name from generate_series(1,case when v_configured_spies>0 then 0 else greatest(0,1-v_drawn_spies-v_reserved_spies) end)
      union all
      select 'guest'::text from generate_series(1,greatest(0,7-v_drawn_guests-v_reserved_guests))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' then
    select * into v_task from tasks where active and not is_demo and stage='task_round_1'
      and mission_code=case v_guest.story_role
        when 'OFFICIANT' then 'P1-CER-001' when 'RING_KEEPER' then 'P1-CER-002'
        when 'GROOM_CHEERLEADER' then 'P1-CER-003' when 'BRIDE_CHEERLEADER' then 'P1-CER-004'
        when 'APPLAUSE_STARTER' then 'P1-CER-005' when 'HEART_HOLDER' then 'P1-HEART-001'
        when 'STAR_HOLDER' then 'P1-STAR-001' else null end
      limit 1;
  elsif v_guest.hidden_role='CUPID_HELPER' or v_role='spy' then
    select * into v_task from tasks t where t.active and not t.is_demo and t.mission_code in
      ('P1-SOCIAL-001','P1-DECOY-001','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006')
      and (t.max_assignments is null or (select count(*) from assignments a where a.task_id=t.id)<t.max_assignments)
      order by -ln(greatest(random(),0.000001))/case when t.mission_code='P1-SOCIAL-001' then 8 else 1 end limit 1;
  else
    select * into v_task from tasks t where t.active and not t.is_demo and t.stage='task_round_1'
      and t.mission_code in ('P1-SOCIAL-001','P1-BONUS-001','P1-DECOY-001','P1-DECOY-002','P1-DECOY-003','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006')
      and (t.max_assignments is null or (select count(*) from assignments a where a.task_id=t.id)<t.max_assignments)
      order by -ln(greatest(random(),0.000001))/case
        when t.mission_code='P1-SOCIAL-001' then 12
        when t.mission_code='P1-BONUS-001' then 2
        else 1 end limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  update guests set team=v_team,role=v_role,drawn_at=now() where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;

  if v_guest.story_role in ('HEART_HOLDER','STAR_HOLDER') then
    insert into symbol_pairing_assignments(guest_id,symbol,status)
    values(v_guest.id,case when v_guest.story_role='HEART_HOLDER' then 'HEART' else 'STAR' end,'AVAILABLE')
    on conflict(guest_id) do update set symbol=excluded.symbol,status='AVAILABLE',partner_guest_id=null,pending_relationship_id=null,finalized_at=null,updated_at=now();
  end if;
  if v_role='spy' then
    select id into v_hidden_task_id from tasks where mission_code='P1-TRICKSTER-001' and active and not is_demo;
    if v_hidden_task_id is null then raise exception using errcode='P0001',message='draw_task_missing'; end if;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false) on conflict(guest_id,task_id) do nothing;
  elsif v_guest.hidden_role='CUPID_HELPER' then
    select id into v_hidden_task_id from tasks where mission_code='P1-SPECIAL-001' and active and not is_demo;
    if v_hidden_task_id is null then raise exception using errcode='P0001',message='draw_task_missing'; end if;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false) on conflict(guest_id,task_id) do nothing;
  end if;
  if v_task.mechanic='INSTANT_BONUS' then
    perform complete_system_mission(v_guest.id,'INSTANT_BONUS','system:instant-bonus','丘比特幸运星自动奖励');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,
    jsonb_build_object('team',v_team,'role',v_role,'hidden_role',v_guest.hidden_role,'story_role',v_guest.story_role,
      'assignment_id',v_assignment.id,'mission_code',v_task.mission_code,'task_catalog_mode','phase-one-real-reserved'));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end; $$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607300003','phase_one.draw_reservations_fix','game_state','1',jsonb_build_object(
  'official_tasks',17,'preset_spies_authoritative',true,'reserved_preset_teams',true,'reserved_preset_roles',true,'family_titles_updated',true
));

commit;
