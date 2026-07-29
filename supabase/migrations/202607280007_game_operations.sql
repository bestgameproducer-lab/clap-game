-- Forward-only wedding-day operations foundation.
alter table tasks add column if not exists category text not null default 'standard';
alter table tasks add column if not exists stage text not null default 'task_round_1';
alter table tasks add column if not exists active boolean not null default true;

do $$ begin
  alter table tasks add constraint tasks_category_check check (
    category in ('standard','ceremony','group','upgrade','hidden')
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table tasks add constraint tasks_stage_check check (
    stage in ('task_round_1','task_round_2','group_game')
  );
exception when duplicate_object then null;
end $$;

alter table clues add column if not exists title text not null default '秘密线索';
alter table clues add column if not exists active boolean not null default true;
alter table guest_clues add column if not exists granted_by text;

alter table assignments add column if not exists rejected_at timestamptz;
alter table assignments add column if not exists rejection_reason text;
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check (status in ('assigned','submitted','approved','rejected'));

alter table game_state add column if not exists scoreboard_visible boolean not null default false;
alter table game_state add column if not exists phase_note text;

create index if not exists assignments_status_created_idx on assignments (status, created_at);
create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists points_ledger_guest_created_idx on points_ledger (guest_id, created_at desc);

create or replace function submit_assignment(p_assignment_id uuid, p_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update assignments
  set status = 'submitted', submitted_at = now(), rejected_at = null, rejection_reason = null
  where id = p_assignment_id and guest_id = p_guest_id and status in ('assigned','rejected');
  if not found then raise exception using errcode = 'P0001', message = 'assignment_not_assignable'; end if;
end;
$$;

revoke all on function submit_assignment(uuid, uuid) from public, anon, authenticated;
grant execute on function submit_assignment(uuid, uuid) to service_role;

create or replace function reject_assignment(p_assignment_id uuid, p_actor text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'reason_required';
  end if;
  update assignments
  set status = 'rejected', rejected_at = now(), rejection_reason = trim(p_reason)
  where id = p_assignment_id and status = 'submitted';
  if not found then raise exception using errcode = 'P0001', message = 'assignment_not_submitted'; end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'assignment.reject', 'assignment', p_assignment_id::text,
          jsonb_build_object('reason', trim(p_reason)));
end;
$$;

revoke all on function reject_assignment(uuid, text, text) from public, anon, authenticated;
grant execute on function reject_assignment(uuid, text, text) to service_role;

create or replace function adjust_guest_points(
  p_guest_id uuid,
  p_amount integer,
  p_actor text,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
  v_actual integer;
begin
  if p_amount = 0 or abs(p_amount) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_point_amount';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'reason_required';
  end if;

  select points into v_before from guests where id = p_guest_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  v_after := greatest(0, v_before + p_amount);
  v_actual := v_after - v_before;
  if v_actual = 0 then
    raise exception using errcode = 'P0001', message = 'point_total_unchanged';
  end if;

  update guests set points = v_after where id = p_guest_id;
  insert into points_ledger (guest_id, amount, reason, actor)
  values (p_guest_id, v_actual, trim(p_reason), p_actor);
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'guest.points_adjust', 'guest', p_guest_id::text,
          jsonb_build_object('amount', v_actual, 'before', v_before, 'after', v_after, 'reason', trim(p_reason)));
  return v_after;
end;
$$;

revoke all on function adjust_guest_points(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function adjust_guest_points(uuid, integer, text, text) to service_role;

create or replace function assign_task_to_guest(p_guest_id uuid, p_task_id uuid, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_assignment_id uuid;
begin
  if not exists (select 1 from guests where id = p_guest_id) then
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  if not exists (select 1 from tasks where id = p_task_id and active) then
    raise exception using errcode = 'P0002', message = 'task_not_found';
  end if;
  insert into assignments (guest_id, task_id)
  values (p_guest_id, p_task_id)
  on conflict (guest_id, task_id) do nothing
  returning id into v_assignment_id;
  if v_assignment_id is null then
    raise exception using errcode = '23505', message = 'task_already_assigned';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'assignment.create', 'assignment', v_assignment_id::text,
          jsonb_build_object('guest_id', p_guest_id, 'task_id', p_task_id));
  return v_assignment_id;
end;
$$;

revoke all on function assign_task_to_guest(uuid, uuid, text) from public, anon, authenticated;
grant execute on function assign_task_to_guest(uuid, uuid, text) to service_role;

create or replace function grant_guest_clue(p_guest_id uuid, p_clue_id uuid, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_grant_id uuid;
begin
  if not exists (select 1 from guests where id = p_guest_id) then
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  if not exists (select 1 from clues where id = p_clue_id and active) then
    raise exception using errcode = 'P0002', message = 'clue_not_found';
  end if;
  insert into guest_clues (guest_id, clue_id, granted_by)
  values (p_guest_id, p_clue_id, p_actor)
  on conflict (guest_id, clue_id) do nothing
  returning id into v_grant_id;
  if v_grant_id is null then
    raise exception using errcode = '23505', message = 'clue_already_granted';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'clue.grant', 'guest_clue', v_grant_id::text,
          jsonb_build_object('guest_id', p_guest_id, 'clue_id', p_clue_id));
  return v_grant_id;
end;
$$;

revoke all on function grant_guest_clue(uuid, uuid, text) from public, anon, authenticated;
grant execute on function grant_guest_clue(uuid, uuid, text) to service_role;

create or replace function configure_guest_game_profile(
  p_guest_id uuid,
  p_team text,
  p_role text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_team), '') is null or length(trim(p_team)) > 40 then
    raise exception using errcode = '22023', message = 'invalid_team';
  end if;
  if p_role not in ('guest','spy','helper') then
    raise exception using errcode = '22023', message = 'invalid_role';
  end if;
  update guests set team = trim(p_team), role = p_role
  where id = p_guest_id and drawn_at is null;
  if not found then
    if exists (select 1 from guests where id = p_guest_id) then
      raise exception using errcode = 'P0001', message = 'guest_card_already_drawn';
    end if;
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'guest.profile_configure', 'guest', p_guest_id::text,
          jsonb_build_object('team', trim(p_team), 'role', p_role));
end;
$$;

revoke all on function configure_guest_game_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function configure_guest_game_profile(uuid, text, text, text) to service_role;

create or replace function create_game_task(
  p_title text,
  p_description text,
  p_points integer,
  p_role_scope text,
  p_category text,
  p_stage text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_task_id uuid;
begin
  if nullif(trim(p_title), '') is null or nullif(trim(p_description), '') is null then
    raise exception using errcode = '22023', message = 'task_content_required';
  end if;
  if p_points < 1 or p_points > 500 then
    raise exception using errcode = '22023', message = 'invalid_task_points';
  end if;
  if p_role_scope not in ('all','guest','spy','helper') then
    raise exception using errcode = '22023', message = 'invalid_role';
  end if;
  if p_category not in ('standard','ceremony','group','upgrade','hidden') then
    raise exception using errcode = '22023', message = 'invalid_task_category';
  end if;
  if p_stage not in ('task_round_1','task_round_2','group_game') then
    raise exception using errcode = '22023', message = 'invalid_game_stage';
  end if;
  insert into tasks (title, description, points, role_scope, category, stage)
  values (trim(p_title), trim(p_description), p_points, p_role_scope, p_category, p_stage)
  returning id into v_task_id;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'task.create', 'task', v_task_id::text,
          jsonb_build_object('title', trim(p_title), 'points', p_points, 'category', p_category, 'stage', p_stage));
  return v_task_id;
end;
$$;

revoke all on function create_game_task(text, text, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function create_game_task(text, text, integer, text, text, text, text) to service_role;

create or replace function create_game_clue(p_title text, p_content text, p_actor text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_clue_id uuid;
begin
  if nullif(trim(p_title), '') is null or nullif(trim(p_content), '') is null then
    raise exception using errcode = '22023', message = 'clue_content_required';
  end if;
  insert into clues (title, content) values (trim(p_title), trim(p_content)) returning id into v_clue_id;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'clue.create', 'clue', v_clue_id::text,
          jsonb_build_object('title', trim(p_title)));
  return v_clue_id;
end;
$$;

revoke all on function create_game_clue(text, text, text) from public, anon, authenticated;
grant execute on function create_game_clue(text, text, text) to service_role;

create or replace function set_game_flag(p_field text, p_value boolean, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field = 'voting_open' then
    update game_state set voting_open = p_value, updated_at = now() where id = 1;
  elsif p_field = 'results_visible' then
    update game_state set results_visible = p_value, updated_at = now() where id = 1;
  elsif p_field = 'scoreboard_visible' then
    update game_state set scoreboard_visible = p_value, updated_at = now() where id = 1;
  else
    raise exception using errcode = '22023', message = 'invalid_game_flag';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.' || p_field, 'game_state', '1', jsonb_build_object('value', p_value));
end;
$$;

revoke all on function set_game_flag(text, boolean, text) from public, anon, authenticated;
grant execute on function set_game_flag(text, boolean, text) to service_role;
