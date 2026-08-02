-- Remove the four rehearsal placeholder clues from every live selection pool.
-- Already-granted clues are retained only as inactive history so references and
-- auditability remain intact; ungranted placeholders are deleted outright.

with deactivated as (
  update clues
  set active = false
  where (team_scope, group_name, title) in (
    ('海岛组', '行动线索', '完成不等于清白'),
    ('海岛组', '身份规则', '唯一恶作剧者'),
    ('沙漠组', '能力线索', '队长身份不等于阵营'),
    ('沙漠组', '身份规则', '本队唯一目标')
  )
  returning id
)
insert into audit_log(actor, action, target_type, target_id, details)
select 'migration:202608020004', 'clue.placeholders_deactivated', 'clues', 'batch',
  jsonb_build_object('count', count(*))
from deactivated;

with removed as (
  delete from clues c
  where (c.team_scope, c.group_name, c.title) in (
    ('海岛组', '行动线索', '完成不等于清白'),
    ('海岛组', '身份规则', '唯一恶作剧者'),
    ('沙漠组', '能力线索', '队长身份不等于阵营'),
    ('沙漠组', '身份规则', '本队唯一目标')
  )
  and not exists (
    select 1 from guest_clues gc where gc.clue_id = c.id
  )
  and not exists (
    select 1 from assignments a where a.reward_clue_id = c.id
  )
  returning id
)
insert into audit_log(actor, action, target_type, target_id, details)
select 'migration:202608020004', 'clue.placeholders_removed', 'clues', 'batch',
  jsonb_build_object('count', count(*))
from removed;
