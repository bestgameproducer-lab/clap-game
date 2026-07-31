-- The new ceremony_end stage resumes phase-one work and must also be accepted
-- as the source state for the explicit act-two finalization transition.

begin;

do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.finalize_phase_one_content(text)'::regprocedure)
  into v_definition;
  if position($q$not in ('registration','waiting','task_round_1','task_round_2','group_game')$q$ in v_definition)=0 then
    raise exception using errcode='P0001',message='phase_one_finalize_stage_patch_target_not_found';
  end if;
  v_definition:=replace(
    v_definition,
    $q$not in ('registration','waiting','task_round_1','task_round_2','group_game')$q$,
    $q$not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','group_game')$q$
  );
  if position($q$'ceremony_end'$q$ in v_definition)=0 then
    raise exception using errcode='P0001',message='phase_one_finalize_stage_patch_verification_failed';
  end if;
  execute v_definition;
end;
$migration$;

revoke all on function finalize_phase_one_content(text) from public,anon,authenticated;
grant execute on function finalize_phase_one_content(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310024','game_stage.ceremony_end_finalization_fixed','game_state','1',jsonb_build_object(
  'runtime_progress_preserved',true,'ceremony_end_can_enter_phase_two',true));

commit;
