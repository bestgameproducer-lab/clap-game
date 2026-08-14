-- Freeze every remaining organizer mutation that can change the published
-- roster, roles, assignments, ceremony record, relationships, or ranking.
-- Pure display controls, credential recovery, and rehearsal reset remain
-- intentionally available after the finale.

begin;

create or replace function assert_wedding_not_final()
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  perform 1 from game_state where id=1 for update;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
end;
$$;

revoke all on function assert_wedding_not_final() from public,anon,authenticated,service_role;

-- Preserve the latest implementation of each RPC under a server-only name,
-- then expose a same-signature wrapper with one shared terminal guard. This
-- avoids duplicating the task/role invariants maintained by earlier migrations.

alter function assign_task_to_guest(uuid,uuid,text)
  rename to assign_task_to_guest_before_final_lock;
revoke all on function assign_task_to_guest_before_final_lock(uuid,uuid,text)
  from public,anon,authenticated,service_role;
create function assign_task_to_guest(p_guest_id uuid,p_task_id uuid,p_actor text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return assign_task_to_guest_before_final_lock(p_guest_id,p_task_id,p_actor);
end;
$$;

alter function reassign_task_assignment(uuid,uuid,text,text)
  rename to reassign_task_assignment_before_final_lock;
revoke all on function reassign_task_assignment_before_final_lock(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
create function reassign_task_assignment(
  p_assignment_id uuid,p_task_id uuid,p_actor text,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return reassign_task_assignment_before_final_lock(
    p_assignment_id,p_task_id,p_actor,p_reason
  );
end;
$$;

alter function update_ceremony_assignment(uuid,text,text,text)
  rename to update_ceremony_assignment_before_final_lock;
revoke all on function update_ceremony_assignment_before_final_lock(uuid,text,text,text)
  from public,anon,authenticated,service_role;
create function update_ceremony_assignment(
  p_assignment_id uuid,p_ceremony_status text,p_ring_variant text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform update_ceremony_assignment_before_final_lock(
    p_assignment_id,p_ceremony_status,p_ring_variant,p_actor
  );
end;
$$;

alter function configure_guest_game_profile(uuid,text,text,text)
  rename to configure_guest_game_profile_before_final_lock;
revoke all on function configure_guest_game_profile_before_final_lock(uuid,text,text,text)
  from public,anon,authenticated,service_role;
create function configure_guest_game_profile(
  p_guest_id uuid,p_team text,p_role text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform configure_guest_game_profile_before_final_lock(
    p_guest_id,p_team,p_role,p_actor
  );
end;
$$;

alter function configure_guest_story_role(uuid,text,text)
  rename to configure_guest_story_role_before_final_lock;
revoke all on function configure_guest_story_role_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;
create function configure_guest_story_role(
  p_guest_id uuid,p_story_role text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform configure_guest_story_role_before_final_lock(
    p_guest_id,p_story_role,p_actor
  );
end;
$$;

alter function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text)
  rename to configure_phase_two_profile_before_final_lock;
revoke all on function configure_phase_two_profile_before_final_lock(uuid,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
create function configure_phase_two_profile(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,p_super_lucky boolean,
  p_is_captain boolean,p_interaction_theme text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform configure_phase_two_profile_before_final_lock(
    p_guest_id,p_primary_mission,p_extra_vote,p_super_lucky,p_is_captain,
    p_interaction_theme,p_actor
  );
end;
$$;

alter function undo_player_relationship(uuid,text,text)
  rename to undo_player_relationship_before_final_lock;
revoke all on function undo_player_relationship_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;
create function undo_player_relationship(
  p_relationship_id uuid,p_actor text,p_reason text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform undo_player_relationship_before_final_lock(
    p_relationship_id,p_actor,p_reason
  );
end;
$$;

alter function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text)
  rename to save_guest_roster_before_final_lock;
revoke all on function save_guest_roster_before_final_lock(uuid,text,text,text,boolean,boolean,boolean,text,text)
  from public,anon,authenticated,service_role;
create function save_guest_roster(
  p_guest_id uuid,p_name text,p_login_name text,p_table_label text,
  p_is_elder boolean,p_ceremony_eligible boolean,p_active boolean,
  p_staff_notes text,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return save_guest_roster_before_final_lock(
    p_guest_id,p_name,p_login_name,p_table_label,p_is_elder,
    p_ceremony_eligible,p_active,p_staff_notes,p_actor
  );
end;
$$;

alter function import_guest_roster(jsonb,text)
  rename to import_guest_roster_before_final_lock;
revoke all on function import_guest_roster_before_final_lock(jsonb,text)
  from public,anon,authenticated,service_role;
create function import_guest_roster(p_rows jsonb,p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return import_guest_roster_before_final_lock(p_rows,p_actor);
end;
$$;

-- Guest actions normally close through stage checks. Guard them explicitly as
-- well so a stale or manually repaired stage can never mutate a published
-- result. These wrappers also cover result_rewards being present before the
-- publication timestamp is repaired.

alter function complete_system_mission(uuid,text,text,text)
  rename to complete_system_mission_before_final_lock;
revoke all on function complete_system_mission_before_final_lock(uuid,text,text,text)
  from public,anon,authenticated,service_role;
create function complete_system_mission(
  p_guest_id uuid,p_mechanic text,p_actor text,p_note text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return complete_system_mission_before_final_lock(
    p_guest_id,p_mechanic,p_actor,p_note
  );
end;
$$;

alter function draw_guest_card(uuid)
  rename to draw_guest_card_before_final_lock;
revoke all on function draw_guest_card_before_final_lock(uuid)
  from public,anon,authenticated,service_role;
create function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,
  task_id uuid,task_title text,task_description text,
  task_verification_method text,task_points integer,card_drawn_at timestamptz
) language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return query select * from draw_guest_card_before_final_lock(p_guest_id);
end;
$$;

alter function submit_assignment(uuid,uuid,text)
  rename to submit_assignment_before_final_lock;
revoke all on function submit_assignment_before_final_lock(uuid,uuid,text)
  from public,anon,authenticated,service_role;
create function submit_assignment(
  p_assignment_id uuid,p_guest_id uuid,p_completion_note text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform submit_assignment_before_final_lock(
    p_assignment_id,p_guest_id,p_completion_note
  );
end;
$$;

alter function complete_assignment_at_station(uuid,text,text)
  rename to complete_assignment_at_station_before_final_lock;
revoke all on function complete_assignment_at_station_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;
create function complete_assignment_at_station(
  p_assignment_id uuid,p_actor text,
  p_reason text default '任务站现场核验通过'
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return complete_assignment_at_station_before_final_lock(
    p_assignment_id,p_actor,p_reason
  );
end;
$$;

alter function request_assignment_mutual_confirmation(uuid,uuid,text)
  rename to request_assignment_mutual_confirmation_before_final_lock;
revoke all on function request_assignment_mutual_confirmation_before_final_lock(uuid,uuid,text)
  from public,anon,authenticated,service_role;
create function request_assignment_mutual_confirmation(
  p_assignment_id uuid,p_owner_guest_id uuid,p_target_code text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return request_assignment_mutual_confirmation_before_final_lock(
    p_assignment_id,p_owner_guest_id,p_target_code
  );
end;
$$;

alter function respond_assignment_mutual_confirmation(uuid,uuid,boolean)
  rename to respond_assignment_mutual_confirmation_before_final_lock;
revoke all on function respond_assignment_mutual_confirmation_before_final_lock(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
create function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform respond_assignment_mutual_confirmation_before_final_lock(
    p_confirmation_id,p_confirmer_guest_id,p_accept
  );
end;
$$;

alter function request_player_connection(uuid,text,text)
  rename to request_player_connection_before_final_lock;
revoke all on function request_player_connection_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;
create function request_player_connection(
  p_guest_id uuid,p_target_code text,p_relationship_type text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return request_player_connection_before_final_lock(
    p_guest_id,p_target_code,p_relationship_type
  );
end;
$$;

alter function accept_player_connection(uuid,uuid)
  rename to accept_player_connection_before_final_lock;
revoke all on function accept_player_connection_before_final_lock(uuid,uuid)
  from public,anon,authenticated,service_role;
create function accept_player_connection(
  p_guest_id uuid,p_relationship_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return accept_player_connection_before_final_lock(
    p_guest_id,p_relationship_id
  );
end;
$$;

alter function reject_player_connection(uuid,uuid)
  rename to reject_player_connection_before_final_lock;
revoke all on function reject_player_connection_before_final_lock(uuid,uuid)
  from public,anon,authenticated,service_role;
create function reject_player_connection(
  p_guest_id uuid,p_relationship_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform reject_player_connection_before_final_lock(
    p_guest_id,p_relationship_id
  );
end;
$$;

alter function submit_phase_two_dilemma(uuid,text)
  rename to submit_phase_two_dilemma_before_final_lock;
revoke all on function submit_phase_two_dilemma_before_final_lock(uuid,text)
  from public,anon,authenticated,service_role;
create function submit_phase_two_dilemma(
  p_guest_id uuid,p_choice text
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return submit_phase_two_dilemma_before_final_lock(p_guest_id,p_choice);
end;
$$;

alter function submit_phase_two_copy_choice(uuid,uuid)
  rename to submit_phase_two_copy_choice_before_final_lock;
revoke all on function submit_phase_two_copy_choice_before_final_lock(uuid,uuid)
  from public,anon,authenticated,service_role;
create function submit_phase_two_copy_choice(
  p_guest_id uuid,p_target_guest_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform submit_phase_two_copy_choice_before_final_lock(
    p_guest_id,p_target_guest_id
  );
end;
$$;

alter function reveal_honor_special_card(uuid)
  rename to reveal_honor_special_card_before_final_lock;
revoke all on function reveal_honor_special_card_before_final_lock(uuid)
  from public,anon,authenticated,service_role;
create function reveal_honor_special_card(p_guest_id uuid)
returns timestamptz language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return reveal_honor_special_card_before_final_lock(p_guest_id);
end;
$$;

alter function adjust_team_resources(text,integer,text,uuid,text)
  rename to adjust_team_resources_before_final_lock;
revoke all on function adjust_team_resources_before_final_lock(text,integer,text,uuid,text)
  from public,anon,authenticated,service_role;
create function adjust_team_resources(
  p_team text,p_amount integer,p_reason text,p_event_key uuid,p_actor text
) returns integer language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return adjust_team_resources_before_final_lock(
    p_team,p_amount,p_reason,p_event_key,p_actor
  );
end;
$$;

alter function confirm_guest_avatar(uuid,text)
  rename to confirm_guest_avatar_before_final_lock;
revoke all on function confirm_guest_avatar_before_final_lock(uuid,text)
  from public,anon,authenticated,service_role;
create function confirm_guest_avatar(p_guest_id uuid,p_avatar_path text)
returns timestamptz language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return confirm_guest_avatar_before_final_lock(p_guest_id,p_avatar_path);
end;
$$;

alter function confirm_assignment_evidence(uuid,uuid,text)
  rename to confirm_assignment_evidence_before_final_lock;
revoke all on function confirm_assignment_evidence_before_final_lock(uuid,uuid,text)
  from public,anon,authenticated,service_role;
create function confirm_assignment_evidence(
  p_assignment_id uuid,p_guest_id uuid,p_evidence_path text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform confirm_assignment_evidence_before_final_lock(
    p_assignment_id,p_guest_id,p_evidence_path
  );
end;
$$;

alter function clear_assignment_evidence(uuid,uuid)
  rename to clear_assignment_evidence_before_final_lock;
revoke all on function clear_assignment_evidence_before_final_lock(uuid,uuid)
  from public,anon,authenticated,service_role;
create function clear_assignment_evidence(
  p_assignment_id uuid,p_guest_id uuid
) returns text language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return clear_assignment_evidence_before_final_lock(
    p_assignment_id,p_guest_id
  );
end;
$$;

alter function confirm_assignment_evidence_staff(uuid,text,text)
  rename to confirm_assignment_evidence_staff_before_final_lock;
revoke all on function confirm_assignment_evidence_staff_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;
create function confirm_assignment_evidence_staff(
  p_assignment_id uuid,p_evidence_path text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  perform confirm_assignment_evidence_staff_before_final_lock(
    p_assignment_id,p_evidence_path,p_actor
  );
end;
$$;

alter function clear_assignment_evidence_staff(uuid,text)
  rename to clear_assignment_evidence_staff_before_final_lock;
revoke all on function clear_assignment_evidence_staff_before_final_lock(uuid,text)
  from public,anon,authenticated,service_role;
create function clear_assignment_evidence_staff(
  p_assignment_id uuid,p_actor text
) returns text language plpgsql security definer set search_path=public as $$
begin
  perform assert_wedding_not_final();
  return clear_assignment_evidence_staff_before_final_lock(
    p_assignment_id,p_actor
  );
end;
$$;

-- Password recovery remains available after publication. Historically its
-- claimed_at reset also cleared an honor guest's revealed-card timestamp,
-- silently removing that guest from the already-published personal ranking.
-- Preserve the ranking fact after the finale; the explicit rehearsal reset
-- still clears it under its transaction-local reset flag.
create or replace function reset_honor_special_card_with_claim()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.claimed_at is not null and new.claimed_at is null then
    if coalesce(current_setting('wedding.rehearsal_reset',true),'')='on' then
      new.special_card_revealed_at=null;
    elsif coalesce((select results_published_at is not null from game_state where id=1),false)
        or exists(select 1 from result_rewards) then
      new.special_card_revealed_at=old.special_card_revealed_at;
    else
      new.special_card_revealed_at=null;
    end if;
  end if;
  return new;
end;
$$;

-- Retire obsolete overloads left behind by early registration/submission
-- iterations. The live routes use the six-argument claim-by-login RPC and the
-- three-argument submission RPC only.
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.submit_assignment(uuid,uuid)',
    'public.claim_guest_identity(text,uuid,text,text,timestamptz)',
    'public.claim_guest_by_login(text,text,text,timestamptz)',
    'public.claim_guest_by_login(text,text,text,text,timestamptz)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute 'revoke all on function '||v_signature||' from public,anon,authenticated,service_role';
    end if;
  end loop;
end;
$$;

-- These functions are internal building blocks of the stage/finale RPCs. They
-- must remain callable by their SECURITY DEFINER owners, but never directly by
-- the service-role API because bypassing the orchestrator would skip ordering,
-- preflight, or the terminal publication transaction.
revoke all on function settle_phase_two_lucky(text)
  from public,anon,authenticated,service_role;
revoke all on function settle_phase_two_copy_and_captain(text)
  from public,anon,authenticated,service_role;
revoke all on function settle_voting_results(integer,text)
  from public,anon,authenticated,service_role;
revoke all on function settle_spy_results(integer,text)
  from public,anon,authenticated,service_role;
revoke all on function finalize_phase_one_content(text)
  from public,anon,authenticated,service_role;
revoke all on function unlock_phase_two_missions(text)
  from public,anon,authenticated,service_role;
revoke all on function unlock_phase_two_missions_assignments_v1(text)
  from public,anon,authenticated,service_role;
revoke all on function save_host_segment(uuid,text,text,text,text,text,text,integer,integer,boolean,text)
  from public,anon,authenticated,service_role;
revoke all on function publish_host_segment(uuid,text)
  from public,anon,authenticated,service_role;

revoke all on function assign_task_to_guest(uuid,uuid,text) from public,anon,authenticated;
revoke all on function reassign_task_assignment(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function update_ceremony_assignment(uuid,text,text,text) from public,anon,authenticated;
revoke all on function configure_guest_game_profile(uuid,text,text,text) from public,anon,authenticated;
revoke all on function configure_guest_story_role(uuid,text,text) from public,anon,authenticated;
revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function undo_player_relationship(uuid,text,text) from public,anon,authenticated;
revoke all on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function import_guest_roster(jsonb,text) from public,anon,authenticated;
revoke all on function complete_system_mission(uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
revoke all on function submit_assignment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function complete_assignment_at_station(uuid,text,text) from public,anon,authenticated;
revoke all on function request_assignment_mutual_confirmation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function request_player_connection(uuid,text,text) from public,anon,authenticated;
revoke all on function accept_player_connection(uuid,uuid) from public,anon,authenticated;
revoke all on function reject_player_connection(uuid,uuid) from public,anon,authenticated;
revoke all on function submit_phase_two_dilemma(uuid,text) from public,anon,authenticated;
revoke all on function submit_phase_two_copy_choice(uuid,uuid) from public,anon,authenticated;
revoke all on function reveal_honor_special_card(uuid) from public,anon,authenticated;
revoke all on function adjust_team_resources(text,integer,text,uuid,text) from public,anon,authenticated;
revoke all on function confirm_guest_avatar(uuid,text) from public,anon,authenticated;
revoke all on function confirm_assignment_evidence(uuid,uuid,text) from public,anon,authenticated;
revoke all on function clear_assignment_evidence(uuid,uuid) from public,anon,authenticated;
revoke all on function confirm_assignment_evidence_staff(uuid,text,text) from public,anon,authenticated;
revoke all on function clear_assignment_evidence_staff(uuid,text) from public,anon,authenticated;

grant execute on function assign_task_to_guest(uuid,uuid,text) to service_role;
grant execute on function reassign_task_assignment(uuid,uuid,text,text) to service_role;
grant execute on function update_ceremony_assignment(uuid,text,text,text) to service_role;
grant execute on function configure_guest_game_profile(uuid,text,text,text) to service_role;
grant execute on function configure_guest_story_role(uuid,text,text) to service_role;
grant execute on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function undo_player_relationship(uuid,text,text) to service_role;
grant execute on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function import_guest_roster(jsonb,text) to service_role;
grant execute on function draw_guest_card(uuid) to service_role;
grant execute on function submit_assignment(uuid,uuid,text) to service_role;
grant execute on function complete_assignment_at_station(uuid,text,text) to service_role;
grant execute on function request_assignment_mutual_confirmation(uuid,uuid,text) to service_role;
grant execute on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) to service_role;
grant execute on function request_player_connection(uuid,text,text) to service_role;
grant execute on function accept_player_connection(uuid,uuid) to service_role;
grant execute on function reject_player_connection(uuid,uuid) to service_role;
grant execute on function submit_phase_two_dilemma(uuid,text) to service_role;
grant execute on function submit_phase_two_copy_choice(uuid,uuid) to service_role;
grant execute on function reveal_honor_special_card(uuid) to service_role;
grant execute on function adjust_team_resources(text,integer,text,uuid,text) to service_role;
grant execute on function confirm_guest_avatar(uuid,text) to service_role;
grant execute on function confirm_assignment_evidence(uuid,uuid,text) to service_role;
grant execute on function clear_assignment_evidence(uuid,uuid) to service_role;
grant execute on function confirm_assignment_evidence_staff(uuid,text,text) to service_role;
grant execute on function clear_assignment_evidence_staff(uuid,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130012','finale.remaining_mutations_locked','game_state','1',jsonb_build_object(
  'locked_rpcs',jsonb_build_array(
    'assign_task_to_guest','reassign_task_assignment','update_ceremony_assignment',
    'configure_guest_game_profile','configure_guest_story_role','configure_phase_two_profile',
    'undo_player_relationship','save_guest_roster','import_guest_roster',
    'complete_system_mission','draw_guest_card','submit_assignment',
    'complete_assignment_at_station','request_assignment_mutual_confirmation',
    'respond_assignment_mutual_confirmation','request_player_connection',
    'accept_player_connection','reject_player_connection',
    'submit_phase_two_dilemma','submit_phase_two_copy_choice',
    'reveal_honor_special_card','adjust_team_resources','confirm_guest_avatar',
    'confirm_assignment_evidence','clear_assignment_evidence',
    'confirm_assignment_evidence_staff','clear_assignment_evidence_staff'
  ),
  'allowed_after_final',jsonb_build_array(
    'scoreboard/display controls','guest phase note','credential recovery','rehearsal reset'
  )
));

commit;
