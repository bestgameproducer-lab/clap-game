-- Make the star-alliance choice understandable before either player commits.
-- This is a wording-only forward migration; scoring logic and runtime choices
-- remain unchanged.

begin;

update tasks set
  description='你与星光伙伴需要分别秘密选择“同行”或“独占”。双方同行各得 3 分；一方独占、另一方同行时，独占者得 5 分、同行者得 0 分；双方独占则各得 1 分。选择提交后不可修改，双方提交前不会显示任何结果。'
where mission_code='P2-STAR-001';

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310027','task.star_dilemma_payoffs_explained','task','P2-STAR-001',jsonb_build_object(
  'scoring_logic_changed',false,'existing_choices_preserved',true,'player_copy_updated',true));

commit;
