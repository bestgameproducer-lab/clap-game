-- Run a real end-to-end task rehearsal without presenting draft content as final wedding tasks.
alter table tasks add column if not exists is_demo boolean not null default false;
alter table game_state add column if not exists task_catalog_mode text not null default 'demo';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='game_state_task_catalog_mode_check') then
    alter table game_state add constraint game_state_task_catalog_mode_check
      check (task_catalog_mode in ('demo','live'));
  end if;
end $$;

insert into tasks (title,description,verification_method,points,role_scope,category,stage,active,is_demo)
select seed.title,seed.description,seed.verification_method,seed.points,seed.role_scope,'standard','task_round_1',true,true
from (values
  ('[演示] 祝福交换','找到一位宾客，彼此说一句送给新人的祝福。这只是流程测试，之后会替换成正式任务。','演示阶段可填写一句测试说明并提交，由主办方在审核入口确认。',1,'guest'),
  ('[演示] 小小误导','向队友提出一个无伤大雅的错误方向，观察大家的反应。这只是流程测试。','演示阶段可填写一句测试说明并提交，由主办方在审核入口确认。',1,'spy'),
  ('[演示] 线索提醒','找到一位同组宾客，提醒对方留意任务中的异常线索。这只是流程测试。','演示阶段可填写一句测试说明并提交，由主办方在审核入口确认。',1,'helper')
) seed(title,description,verification_method,points,role_scope)
where not exists (select 1 from tasks where tasks.title=seed.title);

update tasks set is_demo=true,active=true
where title in ('[演示] 祝福交换','[演示] 小小误导','[演示] 线索提醒');

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
  v_task_catalog_mode text;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select registration_open,task_catalog_mode into v_registration_open,v_task_catalog_mode
  from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;

  -- Repeat requests return the original committed task even if the catalogue mode later changes.
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
    and ((v_task_catalog_mode='demo' and is_demo) or (v_task_catalog_mode='live' and not is_demo))
  order by random() limit 1;
  if not found then
    select * into v_task from tasks
    where active and stage='task_round_1' and category='standard' and role_scope='all'
      and ((v_task_catalog_mode='demo' and is_demo) or (v_task_catalog_mode='live' and not is_demo))
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
      'team_locked',v_guest.team_locked,'role_locked',v_guest.role_locked,'task_catalog_mode',v_task_catalog_mode));
  return query select v_guest.team,v_guest.role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;
