-- Fix preset trickster draws after the phase-one card function introduced a
-- `task_id` output variable that made the hidden-assignment conflict target
-- ambiguous. Also reject a second preset trickster in the same team before
-- guests reach the draw screen.

begin;

do $migration$
declare
  v_definition text;
  v_ambiguous_clause constant text := 'on conflict(guest_id,task_id) do nothing';
  v_explicit_clause constant text := 'on conflict on constraint assignments_guest_id_task_id_key do nothing';
begin
  select pg_get_functiondef('public.draw_guest_card(uuid)'::regprocedure)
  into v_definition;

  if position(v_explicit_clause in v_definition) > 0 then
    null;
  elsif position(v_ambiguous_clause in v_definition) > 0 then
    execute replace(v_definition, v_ambiguous_clause, v_explicit_clause);
  else
    raise exception using
      errcode = 'P0001',
      message = 'draw_guest_card_conflict_clause_not_found';
  end if;
end;
$migration$;

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
declare
  v_guest guests%rowtype;
begin
  if trim(p_team) not in ('玫瑰组','月桂组','星辰组','琥珀组') then
    raise exception using errcode = '22023', message = 'invalid_team';
  end if;
  if p_role not in ('guest','spy','helper') then
    raise exception using errcode = '22023', message = 'invalid_role';
  end if;

  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
  select * into v_guest from guests where id = p_guest_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  if v_guest.drawn_at is not null then
    raise exception using errcode = 'P0001', message = 'guest_card_already_drawn';
  end if;

  if p_role = 'spy' and exists (
    select 1
    from guests g
    where g.id <> p_guest_id
      and g.active
      and g.uses_app
      and g.participation_mode = 'ACTIVE_PLAYER'
      and g.team = trim(p_team)
      and g.role = 'spy'
      and not g.is_hidden_spy
      and (g.drawn_at is not null or g.role_locked)
  ) then
    raise exception using errcode = 'P0001', message = 'preset_spy_team_conflict';
  end if;

  update guests
  set team = trim(p_team), role = p_role, team_locked = true, role_locked = true
  where id = p_guest_id;

  insert into audit_log (actor, action, target_type, target_id, details)
  values (
    p_actor,
    'guest.profile_configure',
    'guest',
    p_guest_id::text,
    jsonb_build_object('team', trim(p_team), 'role', p_role, 'locked', true)
  );
end;
$$;

revoke all on function configure_guest_game_profile(uuid, text, text, text)
from public, anon, authenticated;
grant execute on function configure_guest_game_profile(uuid, text, text, text)
to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202607300005',
  'phase_one.preset_spy_draw_fixed',
  'game_state',
  '1',
  jsonb_build_object(
    'hidden_assignment_conflict_target','assignments_guest_id_task_id_key',
    'duplicate_preset_spy_guard',true
  )
);

commit;
