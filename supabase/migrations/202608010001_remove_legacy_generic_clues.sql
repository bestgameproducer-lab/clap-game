-- Remove legacy generic placeholder clues while preserving any historical
-- grant relationship. Team-scoped finale clues are untouched.

begin;

do $migration$
declare
  v_deleted integer:=0;
  v_disabled integer:=0;
begin
  update clues c
  set active=false
  where c.team_scope is null
    and c.group_name='通用线索'
    and c.title='秘密线索'
    and exists(select 1 from guest_clues gc where gc.clue_id=c.id);
  get diagnostics v_disabled=row_count;

  delete from clues c
  where c.team_scope is null
    and c.group_name='通用线索'
    and c.title='秘密线索'
    and not exists(select 1 from guest_clues gc where gc.clue_id=c.id);
  get diagnostics v_deleted=row_count;

  insert into audit_log(actor,action,target_type,target_id,details)
  values('migration:202608010001','clue.legacy_placeholders_remove','clue','legacy-generic',
    jsonb_build_object('deleted',v_deleted,'disabled_with_history',v_disabled));
end;
$migration$;

commit;
