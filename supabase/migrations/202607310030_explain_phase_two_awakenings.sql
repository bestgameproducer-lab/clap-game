-- Make the two unmatched-symbol outcomes read as deliberate act-two awakenings.
-- This updates reusable task copy only and preserves every live assignment and score.

begin;

update tasks set
  title='孤单丘比特 · 命运复制',
  description='第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并锁定命运；最终揭晓时，你会获得与该玩家第二幕最终个人积分相同的分数。目标一旦提交不能修改，你的选择需要保密。',
  verification_method='在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时自动复制其第二幕个人积分。'
where mission_code='P2-LONELY-001';

update tasks set
  title='领航星 · 带领团队',
  description='第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；如果本队最终排名第一，你将获得 4 点个人积分。',
  verification_method='领航星身份可以公开；系统根据团队最终排名自动结算队长奖励。'
where mission_code='P2-GUIDE-001';

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310030','phase_two.awakening_copy','task_catalog','phase_two',jsonb_build_object(
  'roles',jsonb_build_array('LONELY_CUPID','GUIDING_STAR'),
  'runtime_preserved',true,
  'scores_preserved',true));

commit;
