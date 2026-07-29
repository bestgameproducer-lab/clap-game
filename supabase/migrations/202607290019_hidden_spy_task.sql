-- One controlled hidden-spy mission. Approval promotes one ordinary guest atomically.
alter table tasks add column if not exists grants_hidden_spy boolean not null default false;
alter table guests add column if not exists is_hidden_spy boolean not null default false;

do $$ begin
  alter table tasks add constraint tasks_hidden_spy_rules_check check (
    not grants_hidden_spy or (category='hidden' and role_scope='guest' and stage='task_round_2')
  );
exception when duplicate_object then null;
end $$;

create unique index if not exists tasks_single_active_hidden_spy_idx
  on tasks ((grants_hidden_spy)) where grants_hidden_spy and active;
create unique index if not exists guests_single_hidden_spy_idx
  on guests ((is_hidden_spy)) where is_hidden_spy;

drop function if exists save_game_task(uuid,text,text,integer,text,text,text,boolean,text);
create function save_game_task(
  p_task_id uuid,
  p_title text,
  p_description text,
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
    or nullif(trim(p_description),'') is null or length(trim(p_description))>1000 then
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
    insert into tasks(title,description,points,role_scope,category,stage,active,grants_hidden_spy)
    values(trim(p_title),trim(p_description),p_points,p_role_scope,p_category,p_stage,p_active,p_grants_hidden_spy)
    returning id into v_id;
  else
    select * into v_existing from tasks where id=p_task_id for update;
    if not found then raise exception using errcode='P0002',message='task_not_found'; end if;
    if exists(select 1 from assignments where task_id=p_task_id) and (
      v_existing.points is distinct from p_points or v_existing.role_scope is distinct from p_role_scope
      or v_existing.category is distinct from p_category or v_existing.stage is distinct from p_stage
      or v_existing.grants_hidden_spy is distinct from p_grants_hidden_spy
    ) then raise exception using errcode='P0001',message='task_rules_locked'; end if;
    update tasks set title=trim(p_title),description=trim(p_description),points=p_points,
      role_scope=p_role_scope,category=p_category,stage=p_stage,active=p_active,
      grants_hidden_spy=p_grants_hidden_spy
    where id=p_task_id returning id into v_id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'task.save','task',v_id::text,jsonb_build_object(
    'title',trim(p_title),'points',p_points,'role_scope',p_role_scope,'category',p_category,
    'stage',p_stage,'active',p_active,'grants_hidden_spy',p_grants_hidden_spy));
  return v_id;
end;
$$;

create or replace function assign_task_to_guest(p_guest_id uuid,p_task_id uuid,p_actor text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment_id uuid;
  v_guest guests%rowtype;
  v_task tasks%rowtype;
begin
  select * into v_guest from guests where id=p_guest_id for update;
  if not found or not v_guest.active then raise exception using errcode='P0002',message='guest_not_found'; end if;
  select * into v_task from tasks where id=p_task_id and active;
  if not found then raise exception using errcode='P0002',message='task_not_found'; end if;

  if v_task.grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_guest.drawn_at is null or v_guest.role<>'guest' or v_guest.is_hidden_spy then
      raise exception using errcode='P0001',message='hidden_spy_guest_ineligible';
    end if;
    if exists(select 1 from guests where is_hidden_spy) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
    if exists(
      select 1 from assignments a join tasks t on t.id=a.task_id
      where t.grants_hidden_spy
    ) then raise exception using errcode='P0001',message='hidden_spy_task_already_assigned'; end if;
  end if;

  insert into assignments(guest_id,task_id) values(p_guest_id,p_task_id)
  on conflict(guest_id,task_id) do nothing returning id into v_assignment_id;
  if v_assignment_id is null then raise exception using errcode='23505',message='task_already_assigned'; end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.create','assignment',v_assignment_id::text,
    jsonb_build_object('guest_id',p_guest_id,'task_id',p_task_id,'grants_hidden_spy',v_task.grants_hidden_spy));
  return v_assignment_id;
end;
$$;

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default 'Mission approved'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_points integer;
  v_grants_hidden_spy boolean;
  v_total integer;
  v_rank integer;
  v_role text;
  v_team text;
  v_upgrade_limit integer;
  v_clue_limit integer;
  v_reward_task_id uuid;
  v_reward_assignment_id uuid;
  v_reward_clue_id uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='reason_required'; end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;
  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;

  select points,grants_hidden_spy into v_points,v_grants_hidden_spy from tasks where id=v_assignment.task_id;
  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    select role,team into v_role,v_team from guests where id=v_assignment.guest_id for update;
    if v_role<>'guest' then raise exception using errcode='P0001',message='hidden_spy_guest_ineligible'; end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
  end if;

  insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
  values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  update guests set points=points+v_points,
    role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end
  where id=v_assignment.guest_id returning points,role,team into v_total,v_role,v_team;
  update assignments set status='approved',approved_at=now() where id=v_assignment.id;

  if v_assignment.is_initial then
    select upgrade_reward_limit,clue_reward_limit into v_upgrade_limit,v_clue_limit from game_state where id=1;
    select count(*)::integer into v_rank from assignments where is_initial and status='approved';
    update assignments set completion_rank=v_rank where id=v_assignment.id;

    if v_rank<=v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t
      where t.active and t.category='upgrade' and t.stage='task_round_2'
        and t.role_scope in ('all',v_role)
        and not exists(select 1 from assignments a where a.guest_id=v_assignment.guest_id and a.task_id=t.id)
      order by random() limit 1;
      if v_reward_task_id is not null then
        insert into assignments(guest_id,task_id) values(v_assignment.guest_id,v_reward_task_id)
        returning id into v_reward_assignment_id;
        update assignments set reward_task_id=v_reward_task_id where id=v_assignment.id;
      end if;
    end if;

    if v_rank<=v_clue_limit then
      select c.id into v_reward_clue_id from clues c
      where c.active
        and not exists(select 1 from guest_clues gc where gc.guest_id=v_assignment.guest_id and gc.clue_id=c.id)
        and (
          c.spy_guest_id is null or
          (v_role<>'spy' and exists(select 1 from guests spy where spy.id=c.spy_guest_id and spy.team=v_team and spy.role='spy'))
        )
      order by case when c.spy_guest_id is not null then 0 else 1 end,c.level,random()
      limit 1;
      if v_reward_clue_id is not null then
        insert into guest_clues(guest_id,clue_id,granted_by)
        values(v_assignment.guest_id,v_reward_clue_id,p_actor);
        update assignments set reward_clue_id=v_reward_clue_id where id=v_assignment.id;
      end if;
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object('guest_id',v_assignment.guest_id,'points',v_points,'reason',trim(p_reason),
      'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,
      'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,
    'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,
    'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy);
end;
$$;

revoke all on function save_game_task(uuid,text,text,integer,text,text,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function assign_task_to_guest(uuid,uuid,text) from public,anon,authenticated;
revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
grant execute on function save_game_task(uuid,text,text,integer,text,text,text,boolean,boolean,text) to service_role;
grant execute on function assign_task_to_guest(uuid,uuid,text) to service_role;
grant execute on function approve_assignment(uuid,text,text) to service_role;
