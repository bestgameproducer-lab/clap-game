-- Make every mission's proof requirement explicit from card draw through station approval.
alter table tasks add column if not exists verification_method text not null
  default '向任务站工作人员说明完成过程；如任务涉及照片或合影，请出示对应照片。';

do $$ begin
  alter table tasks add constraint tasks_verification_method_length_check check (
    length(trim(verification_method)) between 1 and 500
  );
exception when duplicate_object then null;
end $$;

drop function if exists save_game_task(uuid,text,text,integer,text,text,text,boolean,boolean,text);
create function save_game_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_verification_method text,
  p_points integer,
  p_role_scope text,
  p_category text,
  p_stage text,
  p_active boolean,
  p_grants_hidden_spy boolean,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_existing tasks%rowtype;
begin
  if nullif(trim(p_title),'') is null or length(trim(p_title))>120
    or nullif(trim(p_description),'') is null or length(trim(p_description))>1000
    or nullif(trim(p_verification_method),'') is null or length(trim(p_verification_method))>500 then
    raise exception using errcode='22023',message='task_content_required';
  end if;
  if p_points<1 or p_points>500 then raise exception using errcode='22023',message='invalid_task_points'; end if;
  if p_role_scope not in ('all','guest','spy','helper') then raise exception using errcode='22023',message='invalid_role'; end if;
  if p_category not in ('standard','ceremony','group','upgrade','hidden') then raise exception using errcode='22023',message='invalid_task_category'; end if;
  if p_stage not in ('task_round_1','task_round_2','group_game') then raise exception using errcode='22023',message='invalid_game_stage'; end if;
  if p_grants_hidden_spy and (p_category<>'hidden' or p_role_scope<>'guest' or p_stage<>'task_round_2') then
    raise exception using errcode='22023',message='invalid_hidden_spy_task';
  end if;

  if p_grants_hidden_spy and p_active then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-task-v1'));
    if exists(select 1 from tasks where grants_hidden_spy and active and id is distinct from p_task_id) then
      raise exception using errcode='P0001',message='active_hidden_spy_task_exists';
    end if;
  end if;

  if p_task_id is null then
    insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,grants_hidden_spy)
    values(trim(p_title),trim(p_description),trim(p_verification_method),p_points,p_role_scope,p_category,p_stage,p_active,p_grants_hidden_spy)
    returning id into v_id;
  else
    select * into v_existing from tasks where id=p_task_id for update;
    if not found then raise exception using errcode='P0002',message='task_not_found'; end if;
    if exists(select 1 from assignments where task_id=p_task_id) and (
      v_existing.points is distinct from p_points or v_existing.role_scope is distinct from p_role_scope
      or v_existing.category is distinct from p_category or v_existing.stage is distinct from p_stage
      or v_existing.grants_hidden_spy is distinct from p_grants_hidden_spy
    ) then raise exception using errcode='P0001',message='task_rules_locked'; end if;
    update tasks set title=trim(p_title),description=trim(p_description),
      verification_method=trim(p_verification_method),points=p_points,
      role_scope=p_role_scope,category=p_category,stage=p_stage,active=p_active,
      grants_hidden_spy=p_grants_hidden_spy
    where id=p_task_id returning id into v_id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'task.save','task',v_id::text,jsonb_build_object(
    'title',trim(p_title),'verification_method',trim(p_verification_method),'points',p_points,
    'role_scope',p_role_scope,'category',p_category,'stage',p_stage,'active',p_active,
    'grants_hidden_spy',p_grants_hidden_spy));
  return v_id;
end;
$$;

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
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;

  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a
    where a.guest_id=v_guest.id and a.is_initial limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_task.id,v_task.title,v_task.description,
      v_task.verification_method,v_task.points,v_guest.drawn_at;
    return;
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

revoke all on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) to service_role;
grant execute on function draw_guest_card(uuid) to service_role;
