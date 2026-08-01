-- Production rejects whole-table service-role mutations unless they carry an
-- explicit predicate. Patch the phase-two allocator without replacing or
-- replaying any existing runtime data.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.unlock_phase_two_missions_assignments_v1(text)'::regprocedure
  ) into v_definition;

  v_updated:=replace(
    v_definition,
    'delete from phase_two_profiles;',
    'delete from phase_two_profiles where true;'
  );
  v_updated:=replace(
    v_updated,
    'update phase_two_profiles set unlocked_at=now(),updated_at=now();',
    'update phase_two_profiles set unlocked_at=now(),updated_at=now() where true;'
  );

  if v_updated=v_definition
    or position('delete from phase_two_profiles;' in v_updated)>0
    or position('update phase_two_profiles set unlocked_at=now(),updated_at=now();' in v_updated)>0
  then
    raise exception using
      errcode='P0001',
      message='phase_two_safe_update_patch_failed';
  end if;

  execute v_updated;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608010006',
  'phase_two.safe_update_fixed',
  'game_state',
  '1',
  jsonb_build_object(
    'explicit_delete_predicate',true,
    'explicit_update_predicate',true,
    'existing_runtime_preserved',true
  )
);

commit;
