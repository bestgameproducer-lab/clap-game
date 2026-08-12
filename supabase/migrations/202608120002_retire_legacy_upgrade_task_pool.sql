-- Retire the obsolete ranked-reward task pool. These tasks predate the current
-- phase-two dinner mission system and must never be assigned or displayed as
-- live guest missions. Preserve approved history and its scoring audit trail.

begin;

with retired as (
  update assignments a
  set status='cancelled',
      cancelled_at=coalesce(a.cancelled_at,now()),
      rejection_reason='剧情调整：旧版抢先完成奖励任务已停用',
      reward_task_id=null,
      reward_clue_id=null
  from tasks t
  where a.task_id=t.id
    and t.category='upgrade'
    and t.stage='task_round_2'
    and a.status in ('assigned','submitted','rejected')
  returning a.id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608120002','legacy_upgrade_assignments.cancelled','assignments','batch',
  jsonb_build_object('count',count(*),'approved_history_preserved',true)
from retired;

with retired as (
  update tasks
  set active=false
  where category='upgrade'
    and stage='task_round_2'
    and active
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608120002','legacy_upgrade_task_pool.retired','tasks','batch',
  jsonb_build_object('count',count(*),'replacement','formal_phase_two_mission_system')
from retired;

commit;
