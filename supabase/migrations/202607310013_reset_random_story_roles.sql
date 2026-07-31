-- Random heart/star roles are draw runtime, while organizer presets are locked.
-- Clear only unlocked random roles during every future rehearsal reset.

begin;

create or replace function reset_phase_two_runtime_after_rehearsal()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  delete from phase_two_dilemmas where true;
  delete from phase_two_copy_choices where true;
  delete from phase_two_profiles where true;
  update guests set story_role='NONE',ceremony_eligible=false
  where not role_locked and story_role<>'NONE';
  return new;
end;
$$;

revoke all on function reset_phase_two_runtime_after_rehearsal() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310013','rehearsal.reset_random_story_roles_fixed','game_state','1',jsonb_build_object(
  'locked_presets_preserved',true,'random_story_roles_cleared',true));

commit;
