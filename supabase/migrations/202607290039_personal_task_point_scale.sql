-- Align task points with the documented 1–3 point personal scale without losing ledger history.
do $$
declare
  v_task record;
  v_delta integer;
  v_approved_count integer;
begin
  lock table tasks in share row exclusive mode;
  for v_task in
    select id,title,points as old_points,
      case
        when grants_hidden_spy then 3
        when category in ('upgrade','hidden') or role_scope in ('spy','helper') then 2
        else 1
      end as new_points
    from tasks
    order by id
  loop
    if v_task.old_points=v_task.new_points then continue; end if;
    v_delta:=v_task.new_points-v_task.old_points;

    select count(*)::integer into v_approved_count
    from assignments where task_id=v_task.id and status='approved';

    insert into points_ledger(guest_id,amount,reason,actor)
    select a.guest_id,v_delta,'任务积分尺度校准','migration:202607290039'
    from assignments a where a.task_id=v_task.id and a.status='approved';

    update guests g set points=g.points+adjustment.total_delta
    from (
      select a.guest_id,count(*)::integer*v_delta as total_delta
      from assignments a where a.task_id=v_task.id and a.status='approved'
      group by a.guest_id
    ) adjustment
    where g.id=adjustment.guest_id;

    update tasks set points=v_task.new_points where id=v_task.id;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('migration:202607290039','task.points_scale','task',v_task.id::text,
      jsonb_build_object('title',v_task.title,'old_points',v_task.old_points,
        'new_points',v_task.new_points,'approved_assignments',v_approved_count,
        'ledger_delta',v_approved_count*v_delta));
  end loop;
end $$;

do $$ begin
  alter table tasks add constraint tasks_personal_point_scale_check check (points between 1 and 3);
exception when duplicate_object then null;
end $$;

create or replace function save_game_task(
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
  if p_points<1 or p_points>3 then raise exception using errcode='22023',message='invalid_task_points'; end if;
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

revoke all on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) to service_role;
