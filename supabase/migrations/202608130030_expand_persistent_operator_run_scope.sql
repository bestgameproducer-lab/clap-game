-- EXPAND/DEPLOY/CONTRACT STEP 2 OF 3 (EXPANSION).
-- This migration only adds the new run-scoped entry points. It deliberately
-- leaves the canonical service-role grants intact so both the old and new app
-- builds can operate during deployment. Apply 202608130031 only after the new
-- app build has been deployed and verified.

begin;

create or replace function configure_guest_game_profile_for_run(
  p_guest_id uuid,p_team text,p_role text,p_actor text,
  p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform configure_guest_game_profile(p_guest_id,p_team,p_role,p_actor);
end;
$$;

create or replace function configure_guest_story_role_for_run(
  p_guest_id uuid,p_story_role text,p_actor text,p_rehearsal_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform configure_guest_story_role(p_guest_id,p_story_role,p_actor);
end;
$$;

create or replace function save_guest_roster_for_run(
  p_guest_id uuid,p_name text,p_login_name text,p_table_label text,
  p_is_elder boolean,p_ceremony_eligible boolean,p_active boolean,
  p_staff_notes text,p_actor text,p_rehearsal_run_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return save_guest_roster(
    p_guest_id,p_name,p_login_name,p_table_label,p_is_elder,
    p_ceremony_eligible,p_active,p_staff_notes,p_actor
  );
end;
$$;

create or replace function import_guest_roster_for_run(
  p_rows jsonb,p_actor text,p_rehearsal_run_id uuid
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  return import_guest_roster(p_rows,p_actor);
end;
$$;

revoke all on function configure_guest_game_profile_for_run(uuid,text,text,text,uuid)
  from public,anon,authenticated;
revoke all on function configure_guest_story_role_for_run(uuid,text,text,uuid)
  from public,anon,authenticated;
revoke all on function save_guest_roster_for_run(uuid,text,text,text,boolean,boolean,boolean,text,text,uuid)
  from public,anon,authenticated;
revoke all on function import_guest_roster_for_run(jsonb,text,uuid)
  from public,anon,authenticated;

grant execute on function configure_guest_game_profile_for_run(uuid,text,text,text,uuid)
  to service_role;
grant execute on function configure_guest_story_role_for_run(uuid,text,text,uuid)
  to service_role;
grant execute on function save_guest_roster_for_run(uuid,text,text,text,boolean,boolean,boolean,text,text,uuid)
  to service_role;
grant execute on function import_guest_roster_for_run(jsonb,text,uuid)
  to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608130030',
  'operator.persistent_edit_wrappers_expanded',
  'game_state',
  '1',
  jsonb_build_object('canonical_grants_retained_until','202608130031')
);

commit;
