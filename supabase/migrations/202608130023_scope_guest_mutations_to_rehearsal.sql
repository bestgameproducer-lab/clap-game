-- Bind every guest session and guest-facing mutation to one rehearsal run.
-- A request can authenticate immediately before reset and reach its mutation
-- after reset commits.  The server therefore passes the run id stored on the
-- authenticated session, and the database validates it while holding the
-- reset advisory lock in shared mode.  A stale request can never write the
-- newly-created run, even if the same guest has already logged in again.

begin;

alter table guest_sessions
  add column if not exists rehearsal_run_id uuid;

update guest_sessions
set rehearsal_run_id=(select rehearsal_run_id from game_state where id=1)
where rehearsal_run_id is null;

alter table guest_sessions
  alter column rehearsal_run_id set not null;

create index if not exists guest_sessions_run_guest_active_idx
on guest_sessions(rehearsal_run_id,guest_id,expires_at)
where revoked_at is null;

create or replace function stamp_guest_session_rehearsal_run()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_run_id uuid;
begin
  -- claim_guest_by_login already takes this shared lock through the Storage
  -- readiness guard.  Keep the trigger independently safe for every future
  -- session creation path as well.
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_run_id
  from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  new.rehearsal_run_id:=v_run_id;
  return new;
end;
$$;

drop trigger if exists stamp_guest_session_rehearsal_run on guest_sessions;
create trigger stamp_guest_session_rehearsal_run
before insert on guest_sessions
for each row execute function stamp_guest_session_rehearsal_run();

create or replace function assert_guest_rehearsal_run(
  p_guest_id uuid,
  p_rehearsal_run_id uuid
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_current_run_id uuid;
begin
  if p_guest_id is null or p_rehearsal_run_id is null then
    raise exception using errcode='22023',message='guest_rehearsal_run_required';
  end if;

  -- The shared transaction lock remains held through the wrapper's call into
  -- the canonical mutation. Reset takes the matching exclusive lock.
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_current_run_id
  from game_state where id=1 for share;
  if not found or v_current_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_current_run_id is distinct from p_rehearsal_run_id then
    raise exception using errcode='P0001',message='guest_rehearsal_run_mismatch';
  end if;

  perform 1 from guests
  where id=p_guest_id and active and uses_app and claimed_at is not null
  for share;
  if not found then
    raise exception using errcode='28000',message='guest_session_stale';
  end if;

  perform 1 from guest_sessions
  where guest_id=p_guest_id
    and rehearsal_run_id=p_rehearsal_run_id
    and revoked_at is null
    and expires_at>now()
  for share;
  if not found then
    raise exception using errcode='28000',message='guest_session_stale';
  end if;
end;
$$;

-- Preserve the canonical one-run implementations. These overloads add only
-- the reset/session boundary and delegate every game invariant to the latest
-- implementation installed by earlier migrations.

create function consume_player_code_attempt(
  p_guest_id uuid,p_rehearsal_run_id uuid
) returns integer language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return consume_player_code_attempt(p_guest_id);
end;
$$;

create function draw_guest_card(
  p_guest_id uuid,p_rehearsal_run_id uuid
) returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,
  task_id uuid,task_title text,task_description text,
  task_verification_method text,task_points integer,card_drawn_at timestamptz
) language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return query select * from draw_guest_card(p_guest_id);
end;
$$;

create function submit_assignment(
  p_assignment_id uuid,p_guest_id uuid,p_completion_note text,
  p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  perform submit_assignment(p_assignment_id,p_guest_id,p_completion_note);
end;
$$;

create function cast_team_vote(
  p_voter_guest_id uuid,p_target_guest_id uuid,p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_voter_guest_id,p_rehearsal_run_id);
  perform cast_team_vote(p_voter_guest_id,p_target_guest_id);
end;
$$;

create function submit_phase_two_dilemma(
  p_guest_id uuid,p_choice text,p_rehearsal_run_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return submit_phase_two_dilemma(p_guest_id,p_choice);
end;
$$;

create function submit_phase_two_copy_choice(
  p_guest_id uuid,p_target_guest_id uuid,p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  perform submit_phase_two_copy_choice(p_guest_id,p_target_guest_id);
end;
$$;

create function reveal_honor_special_card(
  p_guest_id uuid,p_rehearsal_run_id uuid
) returns timestamptz language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return reveal_honor_special_card(p_guest_id);
end;
$$;

create function request_player_connection(
  p_guest_id uuid,p_target_code text,p_relationship_type text,
  p_rehearsal_run_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return request_player_connection(p_guest_id,p_target_code,p_relationship_type);
end;
$$;

create function accept_player_connection(
  p_guest_id uuid,p_relationship_id uuid,p_rehearsal_run_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return accept_player_connection(p_guest_id,p_relationship_id);
end;
$$;

create function reject_player_connection(
  p_guest_id uuid,p_relationship_id uuid,p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  perform reject_player_connection(p_guest_id,p_relationship_id);
end;
$$;

create function request_assignment_mutual_confirmation(
  p_assignment_id uuid,p_owner_guest_id uuid,p_target_code text,
  p_rehearsal_run_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_owner_guest_id,p_rehearsal_run_id);
  return request_assignment_mutual_confirmation(
    p_assignment_id,p_owner_guest_id,p_target_code
  );
end;
$$;

create function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean,
  p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_confirmer_guest_id,p_rehearsal_run_id);
  perform respond_assignment_mutual_confirmation(
    p_confirmation_id,p_confirmer_guest_id,p_accept
  );
end;
$$;

create function authorize_guest_avatar_upload(
  p_guest_id uuid,p_rehearsal_run_id uuid
) returns text language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return authorize_guest_avatar_upload(p_guest_id);
end;
$$;

create function confirm_guest_avatar(
  p_guest_id uuid,p_avatar_path text,p_rehearsal_run_id uuid
) returns timestamptz language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return confirm_guest_avatar(p_guest_id,p_avatar_path);
end;
$$;

create function authorize_guest_assignment_evidence_upload(
  p_assignment_id uuid,p_guest_id uuid,p_rehearsal_run_id uuid
) returns text language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return authorize_guest_assignment_evidence_upload(p_assignment_id,p_guest_id);
end;
$$;

create function confirm_assignment_evidence(
  p_assignment_id uuid,p_guest_id uuid,p_evidence_path text,
  p_rehearsal_run_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  perform confirm_assignment_evidence(p_assignment_id,p_guest_id,p_evidence_path);
end;
$$;

create function clear_assignment_evidence(
  p_assignment_id uuid,p_guest_id uuid,p_rehearsal_run_id uuid
) returns text language plpgsql security definer set search_path=public as $$
begin
  perform assert_guest_rehearsal_run(p_guest_id,p_rehearsal_run_id);
  return clear_assignment_evidence(p_assignment_id,p_guest_id);
end;
$$;

-- The service application must use only run-scoped overloads. SECURITY
-- DEFINER wrappers can still invoke the canonical signatures as their owner.
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
revoke all on function authorize_guest_avatar_upload(uuid) from service_role;
revoke all on function confirm_guest_avatar(uuid,text) from service_role;
revoke all on function authorize_guest_assignment_evidence_upload(uuid,uuid) from service_role;
revoke all on function confirm_assignment_evidence(uuid,uuid,text) from service_role;
revoke all on function clear_assignment_evidence(uuid,uuid) from service_role;

revoke all on function stamp_guest_session_rehearsal_run()
  from public,anon,authenticated,service_role;
revoke all on function assert_guest_rehearsal_run(uuid,uuid)
  from public,anon,authenticated,service_role;

revoke all on function consume_player_code_attempt(uuid,uuid) from public,anon,authenticated;
revoke all on function draw_guest_card(uuid,uuid) from public,anon,authenticated;
revoke all on function submit_assignment(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function cast_team_vote(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function submit_phase_two_dilemma(uuid,text,uuid) from public,anon,authenticated;
revoke all on function submit_phase_two_copy_choice(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function reveal_honor_special_card(uuid,uuid) from public,anon,authenticated;
revoke all on function request_player_connection(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function accept_player_connection(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function reject_player_connection(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function request_assignment_mutual_confirmation(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean,uuid) from public,anon,authenticated;
revoke all on function authorize_guest_avatar_upload(uuid,uuid) from public,anon,authenticated;
revoke all on function confirm_guest_avatar(uuid,text,uuid) from public,anon,authenticated;
revoke all on function authorize_guest_assignment_evidence_upload(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function confirm_assignment_evidence(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function clear_assignment_evidence(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function consume_player_code_attempt(uuid,uuid) to service_role;
grant execute on function draw_guest_card(uuid,uuid) to service_role;
grant execute on function submit_assignment(uuid,uuid,text,uuid) to service_role;
grant execute on function cast_team_vote(uuid,uuid,uuid) to service_role;
grant execute on function submit_phase_two_dilemma(uuid,text,uuid) to service_role;
grant execute on function submit_phase_two_copy_choice(uuid,uuid,uuid) to service_role;
grant execute on function reveal_honor_special_card(uuid,uuid) to service_role;
grant execute on function request_player_connection(uuid,text,text,uuid) to service_role;
grant execute on function accept_player_connection(uuid,uuid,uuid) to service_role;
grant execute on function reject_player_connection(uuid,uuid,uuid) to service_role;
grant execute on function request_assignment_mutual_confirmation(uuid,uuid,text,uuid) to service_role;
grant execute on function respond_assignment_mutual_confirmation(uuid,uuid,boolean,uuid) to service_role;
grant execute on function authorize_guest_avatar_upload(uuid,uuid) to service_role;
grant execute on function confirm_guest_avatar(uuid,text,uuid) to service_role;
grant execute on function authorize_guest_assignment_evidence_upload(uuid,uuid,uuid) to service_role;
grant execute on function confirm_assignment_evidence(uuid,uuid,text,uuid) to service_role;
grant execute on function clear_assignment_evidence(uuid,uuid,uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130023','guest_mutations.rehearsal_scoped','game_state','1',jsonb_build_object(
  'sessions_run_scoped',true,
  'shared_reset_lock',true,
  'stale_session_rejected',true,
  'guest_write_rpc_count',17
));

commit;
