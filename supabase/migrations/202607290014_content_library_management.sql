-- Editable task and clue libraries with immutable scoring rules after assignment.
create or replace function save_game_task(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_points integer,
  p_role_scope text,
  p_category text,
  p_stage text,
  p_active boolean,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_existing tasks%rowtype;
begin
  if nullif(trim(p_title),'') is null or length(trim(p_title)) > 120
    or nullif(trim(p_description),'') is null or length(trim(p_description)) > 1000 then
    raise exception using errcode='22023', message='task_content_required';
  end if;
  if p_points < 1 or p_points > 500 then raise exception using errcode='22023', message='invalid_task_points'; end if;
  if p_role_scope not in ('all','guest','spy','helper') then raise exception using errcode='22023', message='invalid_role'; end if;
  if p_category not in ('standard','ceremony','group','upgrade','hidden') then raise exception using errcode='22023', message='invalid_task_category'; end if;
  if p_stage not in ('task_round_1','task_round_2','group_game') then raise exception using errcode='22023', message='invalid_game_stage'; end if;

  if p_task_id is null then
    insert into tasks(title,description,points,role_scope,category,stage,active)
    values(trim(p_title),trim(p_description),p_points,p_role_scope,p_category,p_stage,p_active)
    returning id into v_id;
  else
    select * into v_existing from tasks where id=p_task_id for update;
    if not found then raise exception using errcode='P0002', message='task_not_found'; end if;
    if exists(select 1 from assignments where task_id=p_task_id) and (
      v_existing.points is distinct from p_points or v_existing.role_scope is distinct from p_role_scope
      or v_existing.category is distinct from p_category or v_existing.stage is distinct from p_stage
    ) then raise exception using errcode='P0001', message='task_rules_locked'; end if;
    update tasks set title=trim(p_title),description=trim(p_description),points=p_points,
      role_scope=p_role_scope,category=p_category,stage=p_stage,active=p_active
    where id=p_task_id returning id into v_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'task.save','task',v_id::text,jsonb_build_object(
    'title',trim(p_title),'points',p_points,'role_scope',p_role_scope,'category',p_category,'stage',p_stage,'active',p_active));
  return v_id;
end;
$$;

create or replace function save_game_clue(
  p_clue_id uuid,
  p_title text,
  p_content text,
  p_active boolean,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if nullif(trim(p_title),'') is null or length(trim(p_title)) > 120
    or nullif(trim(p_content),'') is null or length(trim(p_content)) > 1000 then
    raise exception using errcode='22023', message='clue_content_required';
  end if;
  if p_clue_id is null then
    insert into clues(title,content,active) values(trim(p_title),trim(p_content),p_active) returning id into v_id;
  else
    update clues set title=trim(p_title),content=trim(p_content),active=p_active
    where id=p_clue_id returning id into v_id;
    if v_id is null then raise exception using errcode='P0002', message='clue_not_found'; end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.save','clue',v_id::text,jsonb_build_object('title',trim(p_title),'active',p_active));
  return v_id;
end;
$$;

revoke all on function save_game_task(uuid,text,text,integer,text,text,text,boolean,text) from public, anon, authenticated;
revoke all on function save_game_clue(uuid,text,text,boolean,text) from public, anon, authenticated;
grant execute on function save_game_task(uuid,text,text,integer,text,text,text,boolean,text) to service_role;
grant execute on function save_game_clue(uuid,text,text,boolean,text) to service_role;
