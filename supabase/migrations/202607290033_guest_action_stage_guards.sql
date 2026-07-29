-- Enforce guest action windows in the database, not only in the mobile UI.
drop function if exists draw_guest_card(uuid);
create function draw_guest_card(p_guest_id uuid)
returns table (
  guest_team text,
  guest_role text,
  task_id uuid,
  task_title text,
  task_description text,
  task_verification_method text,
  task_points integer,
  card_drawn_at timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_team text;
  v_role text;
  v_task tasks%rowtype;
  v_assignment assignments%rowtype;
  v_capacity integer;
  v_registration_open boolean;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select registration_open into v_registration_open from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;

  -- A repeat request only returns the already committed card and remains safe after registration closes.
  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a
    where a.guest_id=v_guest.id and a.is_initial limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_task.id,v_task.title,v_task.description,
      v_task.verification_method,v_task.points,v_guest.drawn_at;
    return;
  end if;

  if not coalesce(v_registration_open,false) then
    raise exception using errcode='P0001',message='draw_registration_closed';
  end if;

  if v_guest.team_locked then
    v_team:=v_guest.team;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team;
    if v_team not in ('玫瑰组','月桂组','星辰组','琥珀组') or v_capacity>=8 then
      raise exception using errcode='P0001',message='draw_preset_capacity_full';
    end if;
  else
    select available.team_name into v_team
    from (
      select candidate.team_name,count(g.id) as used_slots
      from (values ('玫瑰组'),('月桂组'),('星辰组'),('琥珀组')) candidate(team_name)
      left join guests g on g.drawn_at is not null and g.team=candidate.team_name
      group by candidate.team_name having count(g.id)<8
    ) available order by available.used_slots,random() limit 1;
    if v_team is null then raise exception using errcode='P0001',message='draw_capacity_full'; end if;
  end if;

  if v_guest.role_locked then
    v_role:=v_guest.role;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team and role=v_role;
    if (v_role in ('spy','helper') and v_capacity>=1) or (v_role='guest' and v_capacity>=6) then
      raise exception using errcode='P0001',message='draw_preset_role_capacity_full';
    end if;
  else
    select slots.role_name into v_role
    from (
      select 'spy'::text as role_name from generate_series(1,greatest(0,1-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='spy')))
      union all
      select 'helper'::text from generate_series(1,greatest(0,1-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='helper')))
      union all
      select 'guest'::text from generate_series(1,greatest(0,6-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='guest')))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  select * into v_task from tasks
  where active and stage='task_round_1' and category='standard' and role_scope=v_role
  order by random() limit 1;
  if not found then
    select * into v_task from tasks
    where active and stage='task_round_1' and category='standard' and role_scope='all'
    order by random() limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  update guests set team=v_team,role=v_role,drawn_at=now()
  where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial)
  values(v_guest.id,v_task.id,true) returning * into v_assignment;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,
    jsonb_build_object('team',v_team,'role',v_role,'assignment_id',v_assignment.id,
      'team_locked',v_guest.team_locked,'role_locked',v_guest.role_locked));
  return query select v_guest.team,v_guest.role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

create or replace function submit_assignment(
  p_assignment_id uuid,
  p_guest_id uuid,
  p_completion_note text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task_stage text;
  v_game_stage text;
begin
  if length(trim(coalesce(p_completion_note,'')))>500 then
    raise exception using errcode='22023',message='completion_note_too_long';
  end if;

  select stage into v_game_stage from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  select t.stage into v_task_stage
  from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and a.guest_id=p_guest_id and a.status in ('assigned','rejected')
  for update of a;
  if not found then raise exception using errcode='P0001',message='assignment_not_assignable'; end if;

  if not (
    (v_game_stage='task_round_1' and v_task_stage='task_round_1')
    or (v_game_stage='task_round_2' and v_task_stage in ('task_round_1','task_round_2'))
    or (v_game_stage='group_game' and v_task_stage in ('task_round_1','task_round_2','group_game'))
  ) then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  update assignments set
    status='submitted',submitted_at=now(),
    completion_note=trim(coalesce(p_completion_note,'')),
    rejected_at=null,rejection_reason=null,
    verification_note='',verified_by=null,verified_at=null
  where id=p_assignment_id;
end;
$$;

create or replace function redeem_hidden_task_code(
  p_guest_id uuid,
  p_code_hash text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code hidden_task_codes%rowtype;
  v_guest guests%rowtype;
  v_assignment_id uuid;
  v_game_stage text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_hidden_task_code_hash';
  end if;

  select stage into v_game_stage from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_game_stage not in ('task_round_2','group_game') then
    raise exception using errcode='P0001',message='hidden_task_stage_closed';
  end if;

  select * into v_code from hidden_task_codes where code_hash=p_code_hash for update;
  if not found then raise exception using errcode='P0002',message='hidden_task_code_invalid'; end if;
  if v_code.claimed_at is not null then
    raise exception using errcode='P0001',message='hidden_task_code_already_claimed';
  end if;

  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='guest_card_not_drawn';
  end if;

  v_assignment_id:=assign_task_to_guest(p_guest_id,v_code.task_id,p_actor);
  update hidden_task_codes set
    claimed_by=p_guest_id,
    claimed_at=now(),
    assignment_id=v_assignment_id
  where id=v_code.id;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'hidden_task_code.redeem','hidden_task_code',v_code.id::text,
    jsonb_build_object('task_id',v_code.task_id,'guest_id',p_guest_id,'assignment_id',v_assignment_id));
  return v_assignment_id;
end;
$$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
revoke all on function submit_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function redeem_hidden_task_code(uuid,text,text) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;
grant execute on function submit_assignment(uuid,uuid,text) to service_role;
grant execute on function redeem_hidden_task_code(uuid,text,text) to service_role;
