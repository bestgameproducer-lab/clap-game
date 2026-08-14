-- EXPAND/DEPLOY/CONTRACT STEP 1 OF 3 (PRE-DEPLOY COMPATIBILITY).
-- Apply after the earlier run-scoping migrations but before deploying the app
-- build that calls their new run-scoped entry points. The currently deployed
-- build still calls these exact legacy signatures, so this temporary grant
-- prevents a database-first rollout from interrupting the live wedding site.
-- 202608130031 removes every temporary grant after the new build is live.

begin;

grant execute on function adjust_host_guest_points(uuid,integer,text,uuid,text) to service_role;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text) to service_role;

grant execute on function set_game_stage(text,text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
grant execute on function set_registration_open(boolean,text) to service_role;
grant execute on function set_guest_phase_note(text,text) to service_role;
grant execute on function set_live_display(text,text,text,integer,text) to service_role;
grant execute on function settle_phase_two_team_clues(text) to service_role;

grant execute on function reset_rehearsal_data(text,boolean,text,uuid,text) to service_role;
grant execute on function reset_guest_claim(uuid,text) to service_role;
grant execute on function save_game_clue_v3(uuid,text,text,text,text,text) to service_role;
grant execute on function save_award(uuid,text,uuid,text,text,integer,boolean,text) to service_role;
grant execute on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) to service_role;

grant execute on function consume_player_code_attempt(uuid) to service_role;
grant execute on function draw_guest_card(uuid) to service_role;
grant execute on function submit_assignment(uuid,uuid,text) to service_role;
grant execute on function cast_team_vote(uuid,uuid) to service_role;
grant execute on function submit_phase_two_dilemma(uuid,text) to service_role;
grant execute on function submit_phase_two_copy_choice(uuid,uuid) to service_role;
grant execute on function reveal_honor_special_card(uuid) to service_role;
grant execute on function request_player_connection(uuid,text,text) to service_role;
grant execute on function accept_player_connection(uuid,uuid) to service_role;
grant execute on function reject_player_connection(uuid,uuid) to service_role;
grant execute on function request_assignment_mutual_confirmation(uuid,uuid,text) to service_role;
grant execute on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) to service_role;
grant execute on function confirm_guest_avatar(uuid,text) to service_role;
grant execute on function confirm_assignment_evidence(uuid,uuid,text) to service_role;
grant execute on function clear_assignment_evidence(uuid,uuid) to service_role;

grant execute on function approve_assignment_with_verification(uuid,text,text) to service_role;
grant execute on function reject_assignment(uuid,text,text) to service_role;
grant execute on function complete_assignment_at_station(uuid,text,text) to service_role;
grant execute on function assign_task_to_guest(uuid,uuid,text) to service_role;
grant execute on function reassign_task_assignment(uuid,uuid,text,text) to service_role;
grant execute on function update_ceremony_assignment(uuid,text,text,text) to service_role;
grant execute on function grant_guest_clue(uuid,uuid,text) to service_role;
grant execute on function undo_player_relationship(uuid,text,text) to service_role;
grant execute on function confirm_assignment_evidence_staff(uuid,text,text) to service_role;
grant execute on function clear_assignment_evidence_staff(uuid,text) to service_role;

-- These calls were not revoked by earlier run-scoping migrations, but they
-- are listed explicitly because the old deployed admin/host build uses them
-- until step 2 is deployed and step 3 closes the canonical entry points.
grant execute on function configure_guest_game_profile(uuid,text,text,text) to service_role;
grant execute on function configure_guest_story_role(uuid,text,text) to service_role;
grant execute on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function import_guest_roster(jsonb,text) to service_role;

-- adjust_team_resources has no reachable product action in the old build. Its
-- existing grant is left untouched during expansion and is retired in 031.

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608130029',
  'deployment.legacy_rpc_compatibility_opened',
  'game_state',
  '1',
  jsonb_build_object(
    'temporary_predeploy_compatibility',true,
    'temporary_rpc_count',42,
    'contract_migration','202608130031'
  )
);

commit;
