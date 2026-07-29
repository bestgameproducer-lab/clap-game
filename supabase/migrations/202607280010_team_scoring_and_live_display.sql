-- Team-game scoring and a host-controlled public display.
create table if not exists team_points_ledger (
  id bigserial primary key,
  team text not null check (team in ('玫瑰组','月桂组','星辰组','琥珀组')),
  amount integer not null check (amount <> 0 and abs(amount) <= 1000),
  reason text not null check (length(trim(reason)) between 1 and 200),
  actor text not null,
  created_at timestamptz not null default now()
);

alter table team_points_ledger enable row level security;
revoke all on team_points_ledger from public, anon, authenticated;
create index if not exists team_points_ledger_team_created_idx on team_points_ledger (team, created_at desc);

alter table game_state add column if not exists display_title text;
alter table game_state add column if not exists display_body text;
alter table game_state add column if not exists public_clue text;
alter table game_state add column if not exists timer_ends_at timestamptz;

create or replace function adjust_team_points(
  p_team text,
  p_amount integer,
  p_actor text,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_total integer;
begin
  if p_team not in ('玫瑰组','月桂组','星辰组','琥珀组') then
    raise exception using errcode = '22023', message = 'invalid_team';
  end if;
  if p_amount = 0 or abs(p_amount) > 1000 then
    raise exception using errcode = '22023', message = 'invalid_point_amount';
  end if;
  if nullif(trim(p_reason), '') is null or length(trim(p_reason)) > 200 then
    raise exception using errcode = '22023', message = 'reason_required';
  end if;

  insert into team_points_ledger (team, amount, reason, actor)
  values (p_team, p_amount, trim(p_reason), p_actor);
  select coalesce(sum(amount), 0)::integer into v_total from team_points_ledger where team = p_team;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'team.points_adjust', 'team', p_team,
          jsonb_build_object('amount', p_amount, 'total', v_total, 'reason', trim(p_reason)));
  return v_total;
end;
$$;

revoke all on function adjust_team_points(text, integer, text, text) from public, anon, authenticated;
grant execute on function adjust_team_points(text, integer, text, text) to service_role;

create or replace function set_live_display(
  p_title text,
  p_body text,
  p_public_clue text,
  p_timer_minutes integer,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(coalesce(p_title, '')) > 120 or length(coalesce(p_body, '')) > 1000 or length(coalesce(p_public_clue, '')) > 500 then
    raise exception using errcode = '22023', message = 'display_content_too_long';
  end if;
  if p_timer_minutes is not null and (p_timer_minutes < 0 or p_timer_minutes > 120) then
    raise exception using errcode = '22023', message = 'invalid_timer_minutes';
  end if;

  update game_state set
    display_title = nullif(trim(coalesce(p_title, '')), ''),
    display_body = nullif(trim(coalesce(p_body, '')), ''),
    public_clue = nullif(trim(coalesce(p_public_clue, '')), ''),
    timer_ends_at = case when p_timer_minutes is null or p_timer_minutes = 0 then null else now() + make_interval(mins => p_timer_minutes) end,
    updated_at = now()
  where id = 1;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.live_display', 'game_state', '1',
          jsonb_build_object('title', nullif(trim(coalesce(p_title, '')), ''), 'timer_minutes', p_timer_minutes,
                             'has_body', nullif(trim(coalesce(p_body, '')), '') is not null,
                             'has_public_clue', nullif(trim(coalesce(p_public_clue, '')), '') is not null));
end;
$$;

revoke all on function set_live_display(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function set_live_display(text, text, text, integer, text) to service_role;
