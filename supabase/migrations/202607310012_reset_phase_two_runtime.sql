-- Extend the existing safe rehearsal reset without rewriting its applied
-- migration. Phase-two profiles and sealed choices are runtime state and must
-- not survive into the next rehearsal.

begin;

create or replace function reset_phase_two_runtime_after_rehearsal()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from phase_two_dilemmas where true;
  delete from phase_two_copy_choices where true;
  delete from phase_two_profiles where true;
  return new;
end;
$$;

drop trigger if exists rehearsal_reset_phase_two_runtime on rehearsal_resets;
create trigger rehearsal_reset_phase_two_runtime
after insert on rehearsal_resets
for each row execute function reset_phase_two_runtime_after_rehearsal();

revoke all on function reset_phase_two_runtime_after_rehearsal() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310012','rehearsal.reset_phase_two_extended','game_state','1',jsonb_build_object(
  'phase_two_profiles',true,'sealed_dilemmas',true,'copy_choices',true,'configuration_preserved',true));

commit;
