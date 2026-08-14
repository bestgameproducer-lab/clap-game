-- EXPAND/DEPLOY/CONTRACT STEP 3 OF 3 (POST-DEPLOY CONTRACT).
-- APPLY ONLY AFTER the application build using every run-scoped RPC has been
-- deployed and smoke-tested. Applying this file before that deploy would break
-- the old production build. It removes every temporary grant opened by
-- 202608130029, closes the persistent canonical entry points now served by the
-- wrappers from 202608130030, and retires the unused auction-wallet mutation.

begin;

revoke all on function adjust_host_guest_points(uuid,integer,text,uuid,text) from service_role;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from service_role;

revoke all on function set_game_stage(text,text) from service_role;
revoke all on function set_game_flag(text,boolean,text) from service_role;
revoke all on function set_registration_open(boolean,text) from service_role;
revoke all on function set_guest_phase_note(text,text) from service_role;
revoke all on function set_live_display(text,text,text,integer,text) from service_role;
revoke all on function settle_phase_two_team_clues(text) from service_role;

revoke all on function reset_rehearsal_data(text,boolean,text,uuid,text) from service_role;
revoke all on function reset_guest_claim(uuid,text) from service_role;
revoke all on function save_game_clue_v3(uuid,text,text,text,text,text) from service_role;
revoke all on function save_award(uuid,text,uuid,text,text,integer,boolean,text) from service_role;
revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) from service_role;

revoke all on function consume_player_code_attempt(uuid) from service_role;
revoke all on function draw_guest_card(uuid) from service_role;
revoke all on function submit_assignment(uuid,uuid,text) from service_role;
revoke all on function cast_team_vote(uuid,uuid) from service_role;
revoke all on function submit_phase_two_dilemma(uuid,text) from service_role;
revoke all on function submit_phase_two_copy_choice(uuid,uuid) from service_role;
revoke all on function reveal_honor_special_card(uuid) from service_role;
revoke all on function request_player_connection(uuid,text,text) from service_role;
revoke all on function accept_player_connection(uuid,uuid) from service_role;
revoke all on function reject_player_connection(uuid,uuid) from service_role;
revoke all on function request_assignment_mutual_confirmation(uuid,uuid,text) from service_role;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) from service_role;
revoke all on function confirm_guest_avatar(uuid,text) from service_role;
revoke all on function confirm_assignment_evidence(uuid,uuid,text) from service_role;
revoke all on function clear_assignment_evidence(uuid,uuid) from service_role;

revoke all on function approve_assignment_with_verification(uuid,text,text) from service_role;
revoke all on function reject_assignment(uuid,text,text) from service_role;
revoke all on function complete_assignment_at_station(uuid,text,text) from service_role;
revoke all on function assign_task_to_guest(uuid,uuid,text) from service_role;
revoke all on function reassign_task_assignment(uuid,uuid,text,text) from service_role;
revoke all on function update_ceremony_assignment(uuid,text,text,text) from service_role;
revoke all on function grant_guest_clue(uuid,uuid,text) from service_role;
revoke all on function undo_player_relationship(uuid,text,text) from service_role;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text) from service_role;
revoke all on function clear_assignment_evidence_staff(uuid,text) from service_role;

revoke all on function configure_guest_game_profile(uuid,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function configure_guest_story_role(uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
revoke all on function import_guest_roster(jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function adjust_team_resources(text,integer,text,uuid,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608130031',
  'deployment.legacy_rpc_contract_closed',
  'game_state',
  '1',
  jsonb_build_object(
    'persistent_wrappers_required',true,
    'auction_wallet_retired',true,
    'temporary_compatibility_closed',true
  )
);

commit;
