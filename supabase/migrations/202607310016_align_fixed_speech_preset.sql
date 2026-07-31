-- The fixed act-two speech is mutually exclusive with heart/star dilemma roles.
-- Remove only an unfinished conflicting symbol preset for the named speaker;
-- the draw function already reserves this player as an ordinary guest.

begin;

update guests set
  story_role='NONE',
  ceremony_eligible=false,
  role='guest',
  role_locked=false,
  eligible_for_secret_role=true
where active and drawn_at is null and lower(login_name)='yirui zhang'
  and story_role in('HEART_HOLDER','STAR_HOLDER');

insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202607310016','phase_two.speech_preset_aligned','guest',id::text,jsonb_build_object(
  'fixed_phase_two_mission','DINNER_SPEECH','conflicting_symbol_preset_removed',true,
  'draw_runtime_preserved',true)
from guests where active and lower(login_name)='yirui zhang';

commit;
