-- Scope remaining rehearsal-owned admin mutations to the run displayed when
-- the operator initiated them. This prevents a delayed old-page request from
-- clearing or repopulating the newly reset wedding. Roster, official tasks,
-- invitation/password settings and locked initial role presets remain durable
-- cross-rehearsal configuration and are intentionally not wrapped here.

begin;

create or replace function reset_rehearsal_data_for_run(
  p_confirmation text,p_backup_confirmed boolean,p_reason text,p_event_key uuid,
  p_actor text,p_rehearsal_run_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return reset_rehearsal_data(
    p_confirmation,p_backup_confirmed,p_reason,p_event_key,p_actor
  );
end;
$$;

create or replace function reset_guest_claim_for_run(
  p_guest_id uuid,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform reset_guest_claim(p_guest_id,p_actor);
end;
$$;

create or replace function save_game_clue_v3_for_run(
  p_clue_id uuid,p_title text,p_content text,p_group_name text,p_team_scope text,
  p_actor text,p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return save_game_clue_v3(
    p_clue_id,p_title,p_content,p_group_name,p_team_scope,p_actor
  );
end;
$$;

create or replace function deactivate_game_clue_for_run(
  p_clue_id uuid,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform deactivate_game_clue(p_clue_id,p_actor);
end;
$$;

create or replace function save_award_for_run(
  p_award_id uuid,p_title text,p_winner_guest_id uuid,p_winner_team text,
  p_reason text,p_sort_order integer,p_published boolean,p_actor text,
  p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return save_award(
    p_award_id,p_title,p_winner_guest_id,p_winner_team,p_reason,p_sort_order,
    p_published,p_actor
  );
end;
$$;

create or replace function configure_phase_two_profile_for_run(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,
  p_super_lucky boolean,p_is_captain boolean,p_interaction_theme text,
  p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform configure_phase_two_profile(
    p_guest_id,p_primary_mission,p_extra_vote,p_super_lucky,p_is_captain,
    p_interaction_theme,p_actor
  );
end;
$$;

-- Only the wrappers are application entry points. Their definer can still call
-- the guarded legacy functions, while future service code cannot bypass run
-- validation accidentally.
revoke all on function reset_rehearsal_data(text,boolean,text,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function reset_guest_claim(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function save_game_clue_v3(uuid,text,text,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function deactivate_game_clue(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function save_award(uuid,text,uuid,text,text,integer,boolean,text)
  from public,anon,authenticated,service_role;
revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;

revoke all on function reset_rehearsal_data_for_run(text,boolean,text,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function reset_guest_claim_for_run(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function save_game_clue_v3_for_run(uuid,text,text,text,text,text,uuid)
  from public,anon,authenticated;
revoke all on function deactivate_game_clue_for_run(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function save_award_for_run(uuid,text,uuid,text,text,integer,boolean,text,uuid)
  from public,anon,authenticated;
revoke all on function configure_phase_two_profile_for_run(uuid,text,boolean,boolean,boolean,text,text,uuid)
  from public,anon,authenticated;

grant execute on function reset_rehearsal_data_for_run(text,boolean,text,uuid,text,uuid)
  to service_role;
grant execute on function reset_guest_claim_for_run(uuid,text,uuid)
  to service_role;
grant execute on function save_game_clue_v3_for_run(uuid,text,text,text,text,text,uuid)
  to service_role;
grant execute on function deactivate_game_clue_for_run(uuid,text,uuid)
  to service_role;
grant execute on function save_award_for_run(uuid,text,uuid,text,text,integer,boolean,text,uuid)
  to service_role;
grant execute on function configure_phase_two_profile_for_run(uuid,text,boolean,boolean,boolean,text,text,uuid)
  to service_role;

commit;
