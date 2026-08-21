-- The final phase-two ability alignment added a whole-table UPDATE after the
-- earlier safe-update migrations. PostgREST's production role rejects that
-- statement without an explicit predicate, which prevented act two from
-- opening. Patch only the stored function definition; do not replay allocation
-- or mutate any existing guest, assignment, score, or phase-two profile data.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_unsafe text:='update phase_two_profiles set
    extra_vote=(primary_mission=''EXTRA_VOTE''),
    super_lucky=(primary_mission=''SUPER_LUCKY''),
    is_captain=(primary_mission=''TEAM_CAPTAIN''),updated_at=now();';
  v_safe text:='update phase_two_profiles set
    extra_vote=(primary_mission=''EXTRA_VOTE''),
    super_lucky=(primary_mission=''SUPER_LUCKY''),
    is_captain=(primary_mission=''TEAM_CAPTAIN''),updated_at=now()
  where true;';
begin
  select pg_get_functiondef(
    'public.unlock_phase_two_missions(text)'::regprocedure
  ) into v_definition;

  if position(v_unsafe in v_definition)>0 then
    v_updated:=replace(v_definition,v_unsafe,v_safe);
    if position(v_unsafe in v_updated)>0 or position(v_safe in v_updated)=0 then
      raise exception using
        errcode='P0001',
        message='phase_two_profile_power_safe_update_patch_failed';
    end if;
    execute v_updated;
  elsif position(v_safe in v_definition)=0 then
    raise exception using
      errcode='P0001',
      message='phase_two_profile_power_safe_update_patch_failed';
  end if;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608210004',
  'phase_two.profile_power_safe_update_fixed',
  'game_state',
  '1',
  jsonb_build_object(
    'explicit_update_predicate',true,
    'existing_runtime_preserved',true,
    'guest_data_mutated',false
  )
);

commit;
