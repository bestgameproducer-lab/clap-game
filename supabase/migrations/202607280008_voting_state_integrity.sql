-- Keep voting, stage, and reveal state consistent even under retries or multiple admins.
alter table game_state add column if not exists voting_opened_at timestamptz;
alter table game_state add column if not exists voting_closed_at timestamptz;
alter table game_state add column if not exists results_published_at timestamptz;

create or replace function set_game_flag(p_field text, p_value boolean, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_field = 'voting_open' then
    if p_value then
      update game_state
      set voting_open = true,
          results_visible = false,
          stage = 'voting',
          voting_opened_at = now(),
          voting_closed_at = null,
          results_published_at = null,
          updated_at = now()
      where id = 1;
    else
      update game_state
      set voting_open = false,
          voting_closed_at = coalesce(voting_closed_at, now()),
          updated_at = now()
      where id = 1;
    end if;
  elsif p_field = 'results_visible' then
    if p_value then
      update game_state
      set voting_open = false,
          results_visible = true,
          stage = 'results',
          voting_closed_at = coalesce(voting_closed_at, now()),
          results_published_at = now(),
          updated_at = now()
      where id = 1;
    else
      update game_state set results_visible = false, results_published_at = null, updated_at = now() where id = 1;
    end if;
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

create or replace function set_game_stage(p_stage text, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode = '22023', message = 'invalid_game_stage';
  end if;

  if p_stage = 'voting' then
    update game_state set stage = p_stage, results_visible = false, results_published_at = null, updated_at = now() where id = 1;
  elsif p_stage = 'results' then
    update game_state
    set stage = p_stage, voting_open = false, voting_closed_at = coalesce(voting_closed_at, now()), updated_at = now()
    where id = 1;
  else
    update game_state
    set stage = p_stage, voting_open = false, results_visible = false,
        voting_closed_at = case when voting_open then now() else voting_closed_at end,
        results_published_at = null, updated_at = now()
    where id = 1;
  end if;

  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.stage', 'game_state', '1', jsonb_build_object('stage', p_stage));
end;
$$;

revoke all on function set_game_stage(text, text) from public, anon, authenticated;
grant execute on function set_game_stage(text, text) to service_role;

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
  v_previous_target uuid;
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

  select target_guest_id into v_previous_target from votes where voter_guest_id = p_voter_guest_id;
  insert into votes (voter_guest_id, target_guest_id)
  values (p_voter_guest_id, p_target_guest_id)
  on conflict (voter_guest_id)
  do update set target_guest_id = excluded.target_guest_id, created_at = now();

  insert into audit_log (actor, action, target_type, target_id, details)
  values ('guest:' || p_voter_guest_id::text, 'vote.cast', 'vote', p_voter_guest_id::text,
          jsonb_build_object('previous_target_id', v_previous_target, 'target_id', p_target_guest_id));
end;
$$;

revoke all on function cast_team_vote(uuid, uuid) from public, anon, authenticated;
grant execute on function cast_team_vote(uuid, uuid) to service_role;
