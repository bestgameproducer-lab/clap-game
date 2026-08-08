-- Pairing now uses one invitation and one direct acceptance. Keep the
-- server-authoritative task cards aligned so guests are not instructed to
-- enter each other's code twice.

begin;

update tasks set
  description='找到持有相反半边的爱心玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。',
  verification_method='一方发起邀请、另一方接受，或由工作人员确认。'
where mission_code='P1-HEART-001';

update tasks set
  description='找到持有相反半边的星星玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。',
  verification_method='一方发起邀请、另一方接受，或由工作人员确认。'
where mission_code='P1-STAR-001';

update tasks set
  description='先用秘密暗号确认对方身份。确认暗号后，一方输入对方玩家编号发出邀请，对方在自己的页面接受即可建立同伴关系。',
  verification_method='一方发起秘密邀请、另一方接受；系统记录同伴关系。'
where mission_code='P1-TRICKSTER-001';

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608080004','task.copy_align_direct_acceptance','task','pairing',jsonb_build_object(
  'mission_codes',jsonb_build_array('P1-HEART-001','P1-STAR-001','P1-TRICKSTER-001'),
  'runtime_records_preserved',true,'mechanics_changed',false));

commit;
