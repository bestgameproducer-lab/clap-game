-- Reject delayed manual-score requests from an earlier rehearsal run. The
-- browser sends the run id it displayed when the operator initiated the
-- action; reset rotates game_state.rehearsal_run_id before the next run.

begin;

create or replace function assert_current_rehearsal_run(p_rehearsal_run_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_current uuid;
begin
  if p_rehearsal_run_id is null then
    raise exception using errcode='22023',message='rehearsal_run_required';
  end if;
  -- Use the reset's lock as well as the game_state row lock. A request that
  -- began while reset was running can therefore only validate before the old
  -- run is cleared, or after the new run id has been committed—never midway.
  perform pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_current from game_state where id=1 for update;
  if v_current is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_current is distinct from p_rehearsal_run_id then
    raise exception using errcode='P0001',message='rehearsal_run_mismatch';
  end if;
end;
$$;

create or replace function adjust_staff_guest_points_for_run(
  p_guest_id uuid,p_amount integer,p_actor text,p_reason text,p_event_key uuid,
  p_rehearsal_run_id uuid
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return adjust_staff_guest_points(p_guest_id,p_amount,p_actor,p_reason,p_event_key);
end;
$$;

create or replace function adjust_staff_team_points_for_run(
  p_team text,p_amount integer,p_actor text,p_reason text,p_event_key uuid,
  p_rehearsal_run_id uuid
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return adjust_staff_team_points(p_team,p_amount,p_actor,p_reason,p_event_key);
end;
$$;

create or replace function adjust_host_guest_points_for_run(
  p_guest_id uuid,p_amount integer,p_reason text,p_event_key uuid,p_actor text,
  p_rehearsal_run_id uuid
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return adjust_host_guest_points(p_guest_id,p_amount,p_reason,p_event_key,p_actor);
end;
$$;

create or replace function adjust_host_team_points_for_run(
  p_team text,p_amount integer,p_reason text,p_event_key uuid,p_actor text,
  p_rehearsal_run_id uuid
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return adjust_host_team_points(p_team,p_amount,p_reason,p_event_key,p_actor);
end;
$$;

-- Application score writes must use the run-scoped entry points. Revoking the
-- legacy signatures prevents a future server call from accidentally restoring
-- the cross-run race; the wrappers can still call them as their owner.
revoke all on function assert_current_rehearsal_run(uuid) from public,anon,authenticated;
revoke all on function adjust_staff_guest_points(uuid,integer,text,text,uuid) from service_role;
revoke all on function adjust_staff_team_points(text,integer,text,text,uuid) from service_role;
revoke all on function adjust_host_guest_points(uuid,integer,text,uuid,text) from service_role;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from service_role;
revoke all on function adjust_staff_guest_points_for_run(uuid,integer,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function adjust_staff_team_points_for_run(text,integer,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function adjust_host_guest_points_for_run(uuid,integer,text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function adjust_host_team_points_for_run(text,integer,text,uuid,text,uuid) from public,anon,authenticated;

grant execute on function assert_current_rehearsal_run(uuid) to service_role;
grant execute on function adjust_staff_guest_points_for_run(uuid,integer,text,text,uuid,uuid) to service_role;
grant execute on function adjust_staff_team_points_for_run(text,integer,text,text,uuid,uuid) to service_role;
grant execute on function adjust_host_guest_points_for_run(uuid,integer,text,uuid,text,uuid) to service_role;
grant execute on function adjust_host_team_points_for_run(text,integer,text,uuid,text,uuid) to service_role;

commit;
