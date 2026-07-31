begin;

-- Retire the Cupid helper gameplay without deleting historical records.
update assignments a
set status = 'cancelled',
    cancelled_at = coalesce(a.cancelled_at, now())
from tasks t
where a.task_id = t.id
  and t.mission_code = 'P1-SPECIAL-001'
  and a.status in ('assigned', 'submitted', 'rejected');

update guests
set hidden_role = 'NONE',
    eligible_for_secret_role = participation_mode = 'ACTIVE_PLAYER' and story_role = 'NONE',
    role = case when hidden_role = 'CUPID_HELPER' then 'guest' else role end,
    role_locked = case when hidden_role = 'CUPID_HELPER' then false else role_locked end
where hidden_role <> 'NONE';

update tasks
set active = false
where mission_code = 'P1-SPECIAL-001';

drop function if exists configure_guest_hidden_role(uuid, text, text);
drop function if exists record_cupid_helper_action(uuid, uuid, text);

alter table guests drop constraint if exists guests_hidden_role_check;
alter table guests add constraint guests_hidden_role_check check (hidden_role = 'NONE');

insert into audit_log(actor, action, target_type, target_id, details)
values(
  'migration:202607300008',
  'cupid_helper.feature_removed',
  'game_state',
  '1',
  jsonb_build_object(
    'helper_task_disabled', true,
    'helper_configuration_disabled', true,
    'historical_records_preserved', true
  )
);

commit;
