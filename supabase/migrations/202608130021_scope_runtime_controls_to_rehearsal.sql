-- Prevent delayed admin/host runtime controls from an earlier rehearsal run
-- from mutating the newly reset wedding. Stable configuration such as the
-- roster, official task catalog and clue library intentionally remains
-- cross-run; only live workflow state is scoped here.

begin;

create or replace function set_game_stage_for_run(
  p_stage text,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform set_game_stage(p_stage,p_actor);
end;
$$;

create or replace function set_game_flag_for_run(
  p_field text,p_value boolean,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform set_game_flag(p_field,p_value,p_actor);
end;
$$;

create or replace function set_registration_open_for_run(
  p_value boolean,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform set_registration_open(p_value,p_actor);
end;
$$;

create or replace function set_guest_phase_note_for_run(
  p_note text,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform set_guest_phase_note(p_note,p_actor);
end;
$$;

create or replace function set_live_display_for_run(
  p_title text,p_body text,p_public_clue text,p_timer_minutes integer,p_actor text,
  p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform set_live_display(p_title,p_body,p_public_clue,p_timer_minutes,p_actor);
end;
$$;

create or replace function settle_phase_two_team_clues_for_run(
  p_actor text,p_rehearsal_run_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return settle_phase_two_team_clues(p_actor);
end;
$$;

-- Server application code must use only the run-scoped entry points. The
-- wrappers still invoke these legacy functions as their database owner.
revoke all on function set_game_stage(text,text) from public,anon,authenticated,service_role;
revoke all on function set_game_flag(text,boolean,text) from public,anon,authenticated,service_role;
revoke all on function set_registration_open(boolean,text) from public,anon,authenticated,service_role;
revoke all on function set_guest_phase_note(text,text) from public,anon,authenticated,service_role;
revoke all on function set_live_display(text,text,text,integer,text) from public,anon,authenticated,service_role;
revoke all on function settle_phase_two_team_clues(text) from public,anon,authenticated,service_role;

revoke all on function set_game_stage_for_run(text,text,uuid) from public,anon,authenticated;
revoke all on function set_game_flag_for_run(text,boolean,text,uuid) from public,anon,authenticated;
revoke all on function set_registration_open_for_run(boolean,text,uuid) from public,anon,authenticated;
revoke all on function set_guest_phase_note_for_run(text,text,uuid) from public,anon,authenticated;
revoke all on function set_live_display_for_run(text,text,text,integer,text,uuid) from public,anon,authenticated;
revoke all on function settle_phase_two_team_clues_for_run(text,uuid) from public,anon,authenticated;

grant execute on function set_game_stage_for_run(text,text,uuid) to service_role;
grant execute on function set_game_flag_for_run(text,boolean,text,uuid) to service_role;
grant execute on function set_registration_open_for_run(boolean,text,uuid) to service_role;
grant execute on function set_guest_phase_note_for_run(text,text,uuid) to service_role;
grant execute on function set_live_display_for_run(text,text,text,integer,text,uuid) to service_role;
grant execute on function settle_phase_two_team_clues_for_run(text,uuid) to service_role;

commit;
