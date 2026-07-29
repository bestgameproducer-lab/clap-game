-- Tiered clue pools tied to a specific spy while keeping generic clues available.
alter table clues add column if not exists spy_guest_id uuid references guests(id) on delete set null;
alter table clues add column if not exists level integer not null default 1;

do $$ begin
  alter table clues add constraint clues_level_check check (level between 1 and 3);
exception when duplicate_object then null;
end $$;

create index if not exists clues_spy_level_active_idx on clues (spy_guest_id,level,active);

create or replace function enforce_clue_spy_reference()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.spy_guest_id is not null and not exists (
    select 1 from guests where id=new.spy_guest_id and role='spy'
  ) then raise exception using errcode='23514',message='clue_target_not_spy'; end if;
  return new;
end;
$$;

drop trigger if exists clues_spy_reference_guard on clues;
create trigger clues_spy_reference_guard before insert or update of spy_guest_id on clues
for each row execute function enforce_clue_spy_reference();

create or replace function protect_referenced_spy_role()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.role='spy' and new.role<>'spy' and exists (
    select 1 from clues where spy_guest_id=new.id
  ) then raise exception using errcode='23514',message='clue_spy_still_referenced'; end if;
  return new;
end;
$$;

drop trigger if exists guests_referenced_spy_role_guard on guests;
create trigger guests_referenced_spy_role_guard before update of role on guests
for each row execute function protect_referenced_spy_role();

drop function if exists save_game_clue(uuid,text,text,boolean,text);
create function save_game_clue(
  p_clue_id uuid,
  p_title text,
  p_content text,
  p_active boolean,
  p_spy_guest_id uuid,
  p_level integer,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_existing clues%rowtype;
begin
  if nullif(trim(p_title),'') is null or nullif(trim(p_content),'') is null then
    raise exception using errcode='22023',message='clue_content_required';
  end if;
  if length(trim(p_title))>120 or length(trim(p_content))>1000 then
    raise exception using errcode='22023',message='clue_content_too_long';
  end if;
  if p_level not between 1 and 3 then raise exception using errcode='22023',message='invalid_clue_level'; end if;
  if p_spy_guest_id is not null and not exists(select 1 from guests where id=p_spy_guest_id and role='spy') then
    raise exception using errcode='22023',message='clue_target_not_spy';
  end if;

  if p_clue_id is null then
    insert into clues(title,content,active,spy_guest_id,level)
    values(trim(p_title),trim(p_content),p_active,p_spy_guest_id,p_level) returning id into v_id;
  else
    select * into v_existing from clues where id=p_clue_id for update;
    if not found then raise exception using errcode='P0002',message='clue_not_found'; end if;
    if exists(select 1 from guest_clues where clue_id=p_clue_id) and
      (v_existing.spy_guest_id is distinct from p_spy_guest_id or v_existing.level<>p_level) then
      raise exception using errcode='P0001',message='clue_rules_locked';
    end if;
    update clues set title=trim(p_title),content=trim(p_content),active=p_active,
      spy_guest_id=p_spy_guest_id,level=p_level where id=p_clue_id returning id into v_id;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.save','clue',v_id::text,
    jsonb_build_object('title',trim(p_title),'active',p_active,'spy_guest_id',p_spy_guest_id,'level',p_level));
  return v_id;
end;
$$;

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default '任务审核通过'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_points integer;
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

  select points into v_points from tasks where id=v_assignment.task_id;
  insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
  values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  update guests set points=points+v_points where id=v_assignment.guest_id
  returning points,role,team into v_total,v_role,v_team;
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
      'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,
    'completion_rank',v_rank,'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id);
end;
$$;

revoke all on function save_game_clue(uuid,text,text,boolean,uuid,integer,text) from public,anon,authenticated;
revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
grant execute on function save_game_clue(uuid,text,text,boolean,uuid,integer,text) to service_role;
grant execute on function approve_assignment(uuid,text,text) to service_role;
