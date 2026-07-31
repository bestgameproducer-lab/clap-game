-- PostgreSQL does not define min(uuid). Select the deterministic first UUID
-- from an ordered aggregate while retaining the exact-one-spy validation.

begin;

do $migration$
declare v_definition text; v_updated text;
begin
  select pg_get_functiondef('public.settle_phase_two_team_clues(text)'::regprocedure) into v_definition;
  v_updated:=replace(v_definition,
    $q$select min(id),count(*)::integer into v_spy_id,v_spy_count$q$,
    $q$select (array_agg(id order by id))[1],count(*)::integer into v_spy_id,v_spy_count$q$);
  if v_updated=v_definition or position($q$min(id)$q$ in v_updated)>0 then
    raise exception using errcode='P0001',message='team_clue_spy_uuid_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310017','phase_two.team_clue_uuid_fixed','game_state','1',jsonb_build_object(
  'ordered_uuid_selection',true,'exact_spy_count_preserved',true,'existing_runtime_preserved',true));

commit;
