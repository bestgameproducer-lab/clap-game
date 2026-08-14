-- Reconcile clue rows created before the latest rehearsal reset. Production
-- may have been reset before the reset-completeness migration existed, so the
-- old run's clue library can otherwise survive even though the current reset
-- function is correct. Preserve every clue created after the reset and every
-- settled team-clue record.
begin;

do $$
declare
  v_last_reset_at timestamptz;
  v_team_clues_settled boolean:=false;
  v_deleted_grants integer:=0;
  v_deleted_clues integer:=0;
  v_applied boolean:=false;
  v_reason text:='no_rehearsal_reset';
begin
  select max(created_at) into v_last_reset_at
  from audit_log
  where action='rehearsal.reset';

  select team_clues_settled_at is not null into v_team_clues_settled
  from game_state
  where id=1
  for update;

  if v_last_reset_at is not null and not coalesce(v_team_clues_settled,false) then
    -- The deletion guard intentionally allows only the protected reset path.
    perform set_config('wedding.rehearsal_reset','on',true);

    delete from guest_clues gc
    using clues c
    where gc.clue_id=c.id
      and c.created_at<=v_last_reset_at;
    get diagnostics v_deleted_grants=row_count;

    delete from clues
    where created_at<=v_last_reset_at;
    get diagnostics v_deleted_clues=row_count;

    if exists(select 1 from clues where created_at<=v_last_reset_at) then
      raise exception using errcode='P0001',message='pre_reset_clue_reconciliation_incomplete';
    end if;

    v_applied:=true;
    v_reason:='pre_reset_rows_removed';
  elsif v_last_reset_at is not null and coalesce(v_team_clues_settled,false) then
    v_reason:='settled_team_clues_preserved';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(
    'migration:202608140010',
    'clue_library.pre_reset_reconciled',
    'game_state',
    '1',
    jsonb_build_object(
      'applied',v_applied,
      'reason',v_reason,
      'last_reset_at',v_last_reset_at,
      'deleted_guest_clue_rows',v_deleted_grants,
      'deleted_clue_rows',v_deleted_clues,
      'post_reset_clues_preserved',true,
      'settled_clues_preserved',true
    )
  );
end;
$$;

commit;
