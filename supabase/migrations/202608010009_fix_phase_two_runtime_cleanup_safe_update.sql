-- The final phase-two wrapper added two whole-table cleanup statements after
-- the original safe-update migration had already run. Production rejects
-- those statements unless they carry an explicit predicate. Patch only the
-- stored function definition; do not replay allocation or alter runtime data.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.unlock_phase_two_missions(text)'::regprocedure
  ) into v_definition;

  v_updated:=replace(
    v_definition,
    'delete from phase_two_dilemmas;',
    'delete from phase_two_dilemmas where true;'
  );
  v_updated:=replace(
    v_updated,
    'delete from phase_two_copy_choices;',
    'delete from phase_two_copy_choices where true;'
  );

  if v_updated=v_definition
    or position('delete from phase_two_dilemmas;' in v_updated)>0
    or position('delete from phase_two_copy_choices;' in v_updated)>0
  then
    raise exception using
      errcode='P0001',
      message='phase_two_runtime_cleanup_safe_update_patch_failed';
  end if;

  execute v_updated;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608010009',
  'phase_two.runtime_cleanup_safe_update_fixed',
  'game_state',
  '1',
  jsonb_build_object(
    'explicit_dilemma_delete_predicate',true,
    'explicit_copy_choice_delete_predicate',true,
    'existing_runtime_preserved',true
  )
);

commit;
