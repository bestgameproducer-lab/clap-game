-- Forward-only security foundation. Apply after supabase/schema.sql.
create table if not exists points_ledger (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  assignment_id uuid references assignments(id) on delete set null,
  amount integer not null check (amount <> 0),
  reason text not null,
  actor text not null,
  created_at timestamptz not null default now(),
  unique (assignment_id)
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table points_ledger enable row level security;
alter table audit_log enable row level security;

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default '任务审核通过'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_points integer;
  v_total integer;
begin
  select * into v_assignment from assignments where id = p_assignment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'assignment_not_found'; end if;
  if v_assignment.status <> 'submitted' then
    raise exception using errcode = 'P0001', message = 'assignment_not_submitted';
  end if;

  select points into v_points from tasks where id = v_assignment.task_id;
  insert into points_ledger (guest_id, assignment_id, amount, reason, actor)
  values (v_assignment.guest_id, v_assignment.id, v_points, p_reason, p_actor);

  update guests set points = points + v_points where id = v_assignment.guest_id returning points into v_total;
  update assignments set status = 'approved', approved_at = now() where id = v_assignment.id;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'assignment.approve', 'assignment', v_assignment.id::text,
          jsonb_build_object('guest_id', v_assignment.guest_id, 'points', v_points, 'reason', p_reason));
  return jsonb_build_object('points_awarded', v_points, 'guest_total', v_total);
end;
$$;

revoke all on function approve_assignment(uuid, text, text) from public, anon, authenticated;
grant execute on function approve_assignment(uuid, text, text) to service_role;

create or replace function reject_assignment(p_assignment_id uuid, p_actor text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update assignments
  set status = 'assigned', submitted_at = null
  where id = p_assignment_id and status = 'submitted';
  if not found then raise exception using errcode = 'P0001', message = 'assignment_not_submitted'; end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'assignment.reject', 'assignment', p_assignment_id::text,
          jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function reject_assignment(uuid, text, text) from public, anon, authenticated;
grant execute on function reject_assignment(uuid, text, text) to service_role;

create or replace function submit_assignment(p_assignment_id uuid, p_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update assignments set status = 'submitted', submitted_at = now()
  where id = p_assignment_id and guest_id = p_guest_id and status = 'assigned';
  if not found then raise exception using errcode = 'P0001', message = 'assignment_not_assignable'; end if;
end;
$$;

revoke all on function submit_assignment(uuid, uuid) from public, anon, authenticated;
grant execute on function submit_assignment(uuid, uuid) to service_role;

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
  else
    raise exception using errcode = '22023', message = 'invalid_game_flag';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.' || p_field, 'game_state', '1', jsonb_build_object('value', p_value));
end;
$$;

revoke all on function set_game_flag(text, boolean, text) from public, anon, authenticated;
grant execute on function set_game_flag(text, boolean, text) to service_role;

create or replace function cast_team_vote(p_voter_guest_id uuid, p_target_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter_team text;
  v_target_team text;
  v_voting_open boolean;
begin
  if p_voter_guest_id = p_target_guest_id then
    raise exception using errcode = '22023', message = 'self_vote';
  end if;
  select voting_open into v_voting_open from game_state where id = 1 for share;
  if not coalesce(v_voting_open, false) then
    raise exception using errcode = 'P0001', message = 'voting_closed';
  end if;
  select team into v_voter_team from guests where id = p_voter_guest_id;
  select team into v_target_team from guests where id = p_target_guest_id;
  if v_voter_team is null or v_target_team is null then
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  if v_voter_team <> v_target_team then
    raise exception using errcode = '22023', message = 'cross_team_vote';
  end if;
  insert into votes (voter_guest_id, target_guest_id)
  values (p_voter_guest_id, p_target_guest_id)
  on conflict (voter_guest_id)
  do update set target_guest_id = excluded.target_guest_id, created_at = now();
end;
$$;

revoke all on function cast_team_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function cast_team_vote(uuid, uuid) to service_role;
