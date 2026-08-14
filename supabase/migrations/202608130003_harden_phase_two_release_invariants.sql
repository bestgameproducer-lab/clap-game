-- Make the second-act release atomic and retire every superseded dinner task.
-- Historical points and audit rows are preserved; obsolete assignments are
-- cancelled rather than deleted so they can no longer appear to guests.

begin;

-- Custom tasks may still be drafted during rehearsal, but they never become a
-- formal wedding assignment merely because they are active. Only this
-- migration may mark the immutable organizer-approved catalog as formal.
alter table tasks add column if not exists formal_allowed boolean not null default false;

-- Restore the organizer-approved wording as part of the authoritative task
-- contract.  The application preflight checks the same fields before opening.
update tasks t set
  title=official.title,
  description=official.description,
  verification_method=official.verification_method
from (values
  ('P1-CER-001','誓词引导人','请在工作人员通知后到达指定位置，引导新人完成誓词。不要提前上台或公开任务。','由主持人确认流程沟通、到位及誓词引导均已完成。'),
  ('P1-CER-002','戒指守护者','请在工作人员通知后领取指定戒指盒，并在交换戒指环节按照提示送到新人身边。','由主持人确认戒指已经安全送达。'),
  ('P1-CER-003','新郎应援者','在新郎入场或主持人给出提示时说：“新郎今天太帅了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。'),
  ('P1-CER-004','新娘应援者','在新娘入场或主持人给出提示时说：“新娘今天太美了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。'),
  ('P1-HEART-001','寻找爱心伙伴','找到持有相反半边的爱心玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。'),
  ('P1-STAR-001','寻找星星伙伴','找到持有相反半边的星星玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。'),
  ('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。'),
  ('P1-SOCIAL-002','拍摄一张新郎新娘同框的照片','在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。','上传照片或向任务站工作人员出示照片。'),
  ('P1-BONUS-001','丘比特幸运星','丘比特今天格外眷顾你。你不需要完成额外任务，打开卡片后立即获得2点个人积分。','系统自动完成。'),
  ('P1-TRICKSTER-001','寻找恶作剧者同伴','先用秘密暗号确认对方身份。确认暗号后，一方输入对方玩家编号发出邀请，对方在自己的页面接受即可建立同伴关系。','一方发起秘密邀请、另一方接受；系统记录同伴关系。'),
  ('P1-FAMILY-001','双人幸福留影','这是陈天然和陈子宥共同完成的任务：请两个人一起拍一张开心的婚礼合影，留下今天的专属纪念。','上传两人的婚礼合影，或向任务站工作人员出示照片。'),
  ('P2-SOCIAL-001','来自丘比特的敬意','请在晚宴期间找到新郎的爸爸，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。'),
  ('P2-SOCIAL-002','来自丘比特的祝福','请在晚宴期间找到新娘的妈妈，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。'),
  ('P2-SOCIAL-003','新郎特别任务','找到新郎，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新郎的重要流程。','上传符合指定主题的合影。'),
  ('P2-SOCIAL-004','新娘特别任务','找到新娘，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新娘的重要流程。','上传符合指定主题的合影。'),
  ('P2-CEREMONY-001','晚宴致辞人','请准备一段一至三分钟、真诚且不过度私密的新人祝福，并在主持人指定时间完成致辞。','由主持人或主办方确认。'),
  ('P2-HEART-001','爱与恨的秘密选择','你和爱心伙伴必须各自秘密选择“爱”或“恨”，全程不能商量、暗示或展示页面。双方都选爱：各得 3 分；一方选爱、一方选恨：爱为 0 分、恨为 5 分；双方都选恨：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。'),
  ('P2-STAR-001','星光抉择','你和星光伙伴必须各自秘密选择“同行”或“独占”，全程不能商量、暗示或展示页面。双方都选同行：各得 3 分；一方同行、一方独占：同行为 0 分、独占为 5 分；双方都选独占：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。'),
  ('P2-LONELY-001','孤单丘比特 · 命运复制','第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并锁定命运；最终揭晓时，你会获得与该玩家第二轮正式任务积分相同的分数。后台人工调整、第一轮积分、丘比特幸运星翻倍与投票奖励都不计入复制。目标一旦提交不能修改，你的选择需要保密。','在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时按第二轮正式任务积分自动复制。'),
  ('P2-GUIDE-001','领航星 · 带领团队','第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；如果本队最终排名第一，你将获得 4 点个人积分。','领航星身份可以公开；系统根据团队最终排名自动结算队长奖励。'),
  ('P2-TRICKSTER-001','丘比特的恶作剧者','尽可能让自己的团队在晚宴游戏中失去优势，同时隐藏身份。不得破坏婚礼、设备或他人手机。','最终投票与团队排名自动结算。'),
  ('P2-POWER-001','双重裁决','你拥有一次双重裁决：最终投票仍只选择一名本队玩家，但系统会将你的选择按两票计算。投票权重在身份揭晓前保密。','系统在最终投票时自动计算。'),
  ('P2-LUCKY-001','丘比特幸运星','第二阶段开启时，系统立即按你第一阶段已经获得的个人积分发放同额奖励，并自动完成此任务。如果你的第一项任务也是“丘比特幸运星”，再额外获得 2 分。','第二阶段开启时由系统立即结算并标记完成。')
) as official(mission_code,title,description,verification_method)
where t.mission_code=official.mission_code;

-- Correct every behavior-bearing field before the catalog lock is installed.
-- Text and runtime mechanics therefore share one authoritative contract.
update tasks t set
  points=official.points,max_assignments=official.max_assignments,
  role_scope=official.role_scope,category=official.category,stage=official.stage,
  story_role_scope=official.story_role_scope,mechanic=official.mechanic,
  score_policy=official.score_policy,assignment_mode=official.assignment_mode,
  verification_type=official.verification_type,active=true,is_demo=false,
  grants_hidden_spy=false,formal_allowed=true
from (values
  ('P1-CER-001',5,1,'guest','ceremony','task_round_1','OFFICIANT','STANDARD','STANDARD','MANUAL','HOST_CONFIRM'),
  ('P1-CER-002',3,2,'guest','ceremony','task_round_1','RING_KEEPER','STANDARD','STANDARD','MANUAL','HOST_CONFIRM'),
  ('P1-CER-003',3,1,'guest','ceremony','task_round_1','GROOM_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM'),
  ('P1-CER-004',3,1,'guest','ceremony','task_round_1','BRIDE_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM'),
  ('P1-HEART-001',2,5,'guest','standard','task_round_1','HEART_HOLDER','HEART_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM'),
  ('P1-STAR-001',2,5,'guest','standard','task_round_1','STAR_HOLDER','STAR_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM'),
  ('P1-SOCIAL-001',2,2,'all','standard','task_round_1','NONE','STANDARD','STANDARD','RANDOM','PHOTO'),
  ('P1-SOCIAL-002',2,2,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO'),
  ('P1-BONUS-001',2,2,'guest','standard','task_round_1','NONE','INSTANT_BONUS','STANDARD','RANDOM','SYSTEM_CONFIRM'),
  ('P1-TRICKSTER-001',0,null::integer,'spy','hidden','task_round_1','NONE','TRICKSTER_SIGNAL','NO_PERSONAL','RANDOM','MUTUAL_CONFIRM'),
  ('P1-FAMILY-001',2,1,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO'),
  ('P2-SOCIAL-001',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO'),
  ('P2-SOCIAL-002',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO'),
  ('P2-SOCIAL-003',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO'),
  ('P2-SOCIAL-004',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO'),
  ('P2-CEREMONY-001',5,1,'guest','ceremony','task_round_2','NONE','STANDARD','STANDARD','FIXED','HOST_CONFIRM'),
  ('P2-HEART-001',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM'),
  ('P2-STAR-001',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM'),
  ('P2-LONELY-001',0,1,'guest','standard','task_round_2','NONE','COPY_SCORE','NO_PERSONAL','RELATIONSHIP','SYSTEM'),
  ('P2-GUIDE-001',0,1,'guest','standard','task_round_2','NONE','TEAM_CAPTAIN','NO_PERSONAL','RELATIONSHIP','SYSTEM'),
  ('P2-TRICKSTER-001',0,2,'guest','hidden','task_round_2','NONE','TRICKSTER_MISSION','NO_PERSONAL','ROLE_FIXED','SYSTEM'),
  ('P2-POWER-001',0,2,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM'),
  ('P2-LUCKY-001',0,1,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM')
) as official(mission_code,points,max_assignments,role_scope,category,stage,
  story_role_scope,mechanic,score_policy,assignment_mode,verification_type)
where t.mission_code=official.mission_code;

create or replace function formal_wedding_catalog_ready()
returns boolean language sql stable security definer set search_path=public as $$
  with expected(
    mission_code,title,description,verification_method,points,max_assignments,
    role_scope,category,stage,story_role_scope,mechanic,score_policy,
    assignment_mode,verification_type,active,is_demo,grants_hidden_spy
  ) as (values
    ('P1-CER-001','誓词引导人','请在工作人员通知后到达指定位置，引导新人完成誓词。不要提前上台或公开任务。','由主持人确认流程沟通、到位及誓词引导均已完成。',5,1,'guest','ceremony','task_round_1','OFFICIANT','STANDARD','STANDARD','MANUAL','HOST_CONFIRM',true,false,false),
    ('P1-CER-002','戒指守护者','请在工作人员通知后领取指定戒指盒，并在交换戒指环节按照提示送到新人身边。','由主持人确认戒指已经安全送达。',3,2,'guest','ceremony','task_round_1','RING_KEEPER','STANDARD','STANDARD','MANUAL','HOST_CONFIRM',true,false,false),
    ('P1-CER-003','新郎应援者','在新郎入场或主持人给出提示时说：“新郎今天太帅了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。',3,1,'guest','ceremony','task_round_1','GROOM_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',true,false,false),
    ('P1-CER-004','新娘应援者','在新娘入场或主持人给出提示时说：“新娘今天太美了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。',3,1,'guest','ceremony','task_round_1','BRIDE_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',true,false,false),
    ('P1-HEART-001','寻找爱心伙伴','找到持有相反半边的爱心玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。',2,5,'guest','standard','task_round_1','HEART_HOLDER','HEART_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',true,false,false),
    ('P1-STAR-001','寻找星星伙伴','找到持有相反半边的星星玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。',2,5,'guest','standard','task_round_1','STAR_HOLDER','STAR_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',true,false,false),
    ('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。',2,2,'all','standard','task_round_1','NONE','STANDARD','STANDARD','RANDOM','PHOTO',true,false,false),
    ('P1-SOCIAL-002','拍摄一张新郎新娘同框的照片','在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。','上传照片或向任务站工作人员出示照片。',2,2,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P1-BONUS-001','丘比特幸运星','丘比特今天格外眷顾你。你不需要完成额外任务，打开卡片后立即获得2点个人积分。','系统自动完成。',2,2,'guest','standard','task_round_1','NONE','INSTANT_BONUS','STANDARD','RANDOM','SYSTEM_CONFIRM',true,false,false),
    ('P1-TRICKSTER-001','寻找恶作剧者同伴','先用秘密暗号确认对方身份。确认暗号后，一方输入对方玩家编号发出邀请，对方在自己的页面接受即可建立同伴关系。','一方发起秘密邀请、另一方接受；系统记录同伴关系。',0,null::integer,'spy','hidden','task_round_1','NONE','TRICKSTER_SIGNAL','NO_PERSONAL','RANDOM','MUTUAL_CONFIRM',true,false,false),
    ('P1-FAMILY-001','双人幸福留影','这是陈天然和陈子宥共同完成的任务：请两个人一起拍一张开心的婚礼合影，留下今天的专属纪念。','上传两人的婚礼合影，或向任务站工作人员出示照片。',2,1,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P2-SOCIAL-001','来自丘比特的敬意','请在晚宴期间找到新郎的爸爸，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO',true,false,false),
    ('P2-SOCIAL-002','来自丘比特的祝福','请在晚宴期间找到新娘的妈妈，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO',true,false,false),
    ('P2-SOCIAL-003','新郎特别任务','找到新郎，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新郎的重要流程。','上传符合指定主题的合影。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO',true,false,false),
    ('P2-SOCIAL-004','新娘特别任务','找到新娘，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新娘的重要流程。','上传符合指定主题的合影。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','FIXED','PHOTO',true,false,false),
    ('P2-CEREMONY-001','晚宴致辞人','请准备一段一至三分钟、真诚且不过度私密的新人祝福，并在主持人指定时间完成致辞。','由主持人或主办方确认。',5,1,'guest','ceremony','task_round_2','NONE','STANDARD','STANDARD','FIXED','HOST_CONFIRM',true,false,false),
    ('P2-HEART-001','爱与恨的秘密选择','你和爱心伙伴必须各自秘密选择“爱”或“恨”，全程不能商量、暗示或展示页面。双方都选爱：各得 3 分；一方选爱、一方选恨：爱为 0 分、恨为 5 分；双方都选恨：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-STAR-001','星光抉择','你和星光伙伴必须各自秘密选择“同行”或“独占”，全程不能商量、暗示或展示页面。双方都选同行：各得 3 分；一方同行、一方独占：同行为 0 分、独占为 5 分；双方都选独占：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-LONELY-001','孤单丘比特 · 命运复制','第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并锁定命运；最终揭晓时，你会获得与该玩家第二轮正式任务积分相同的分数。后台人工调整、第一轮积分、丘比特幸运星翻倍与投票奖励都不计入复制。目标一旦提交不能修改，你的选择需要保密。','在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时按第二轮正式任务积分自动复制。',0,1,'guest','standard','task_round_2','NONE','COPY_SCORE','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-GUIDE-001','领航星 · 带领团队','第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；如果本队最终排名第一，你将获得 4 点个人积分。','领航星身份可以公开；系统根据团队最终排名自动结算队长奖励。',0,1,'guest','standard','task_round_2','NONE','TEAM_CAPTAIN','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-TRICKSTER-001','丘比特的恶作剧者','尽可能让自己的团队在晚宴游戏中失去优势，同时隐藏身份。不得破坏婚礼、设备或他人手机。','最终投票与团队排名自动结算。',0,2,'guest','hidden','task_round_2','NONE','TRICKSTER_MISSION','NO_PERSONAL','ROLE_FIXED','SYSTEM',true,false,false),
    ('P2-POWER-001','双重裁决','你拥有一次双重裁决：最终投票仍只选择一名本队玩家，但系统会将你的选择按两票计算。投票权重在身份揭晓前保密。','系统在最终投票时自动计算。',0,2,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM',true,false,false),
    ('P2-LUCKY-001','丘比特幸运星','第二阶段开启时，系统立即按你第一阶段已经获得的个人积分发放同额奖励，并自动完成此任务。如果你的第一项任务也是“丘比特幸运星”，再额外获得 2 分。','第二阶段开启时由系统立即结算并标记完成。',0,1,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','ROLE_FIXED','SYSTEM',true,false,false)
  )
  select
    (select count(*) from expected)=23
    and not exists(
      select 1
      from expected e
      left join tasks t on t.mission_code=e.mission_code
      where t.id is null
        or t.title is distinct from e.title
        or t.description is distinct from e.description
        or t.verification_method is distinct from e.verification_method
        or t.points is distinct from e.points
        or t.max_assignments is distinct from e.max_assignments
        or t.role_scope is distinct from e.role_scope
        or t.category is distinct from e.category
        or t.stage is distinct from e.stage
        or t.story_role_scope is distinct from e.story_role_scope
        or t.mechanic is distinct from e.mechanic
        or t.score_policy is distinct from e.score_policy
        or t.assignment_mode is distinct from e.assignment_mode
        or t.verification_type is distinct from e.verification_type
        or t.active is distinct from e.active
        or t.is_demo is distinct from e.is_demo
        or t.grants_hidden_spy is distinct from e.grants_hidden_spy
        or t.formal_allowed is distinct from true
    )
    and not exists(
      select 1 from tasks t
      where t.active and coalesce(t.mission_code,'') ~* '^P[12]-'
        and not exists(select 1 from expected e where e.mission_code=t.mission_code)
    )
    and not exists(select 1 from tasks where formal_allowed
      and coalesce(mission_code,'') !~* '^P[12]-');
$$;

-- Historical roster migrations enabled personal scoring for the two later
-- additions only. Align all seven honor-family accounts with the confirmed
-- rule: no secret/team play, but staff-awarded personal points and final-rank
-- visibility remain available.
with repaired as (
  update guests set eligible_for_personal_score=true
  where active and team='家人组' and participation_mode='HONOR_GUEST'
    and lower(regexp_replace(trim(login_name),'\s+',' ','g')) in(
      'danying yang','liying jin','jianjun jin','xiaofeng jin','wei jin','huimin xu','gang yao'
    )
    and not eligible_for_personal_score
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','guest.honor_family_score_eligibility_repaired',
  'guest_group','HONOR_GUEST',jsonb_build_object('count',count(*),'personal_points',true)
from repaired;

create or replace function formal_wedding_roster_ready()
returns boolean language sql stable security definer set search_path=public as $$
  with expected(login_name,team,participation_mode,phase_two_eligible,
    eligible_for_mission,eligible_for_personal_score) as (values
    ('danying yang','家人组','HONOR_GUEST',false,false,true),
    ('liying jin','家人组','HONOR_GUEST',false,false,true),
    ('jianjun jin','家人组','HONOR_GUEST',false,false,true),
    ('xiaofeng jin','家人组','HONOR_GUEST',false,false,true),
    ('wei jin','家人组','HONOR_GUEST',false,false,true),
    ('huimin xu','家人组','HONOR_GUEST',false,false,true),
    ('gang yao','家人组','HONOR_GUEST',false,false,true),
    ('xingcheng jin','家人组','ACTIVE_PLAYER',false,true,true),
    ('andao chen','家人组','ACTIVE_PLAYER',false,true,true),
    ('ziyang jin','家人组','ACTIVE_PLAYER',false,true,true),
    ('tianran chen & ziyou chen','家人组','ACTIVE_PLAYER',false,true,true),
    ('yirui zhang','海岛组','ACTIVE_PLAYER',true,true,true),
    ('huijie huang','海岛组','ACTIVE_PLAYER',true,true,true),
    ('feifei xie','海岛组','ACTIVE_PLAYER',true,true,true),
    ('tang-ling yeh','海岛组','ACTIVE_PLAYER',true,true,true),
    ('tianyi shi','海岛组','ACTIVE_PLAYER',true,true,true),
    ('wenli xu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('yi ren','海岛组','ACTIVE_PLAYER',true,true,true),
    ('yue liu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('zikun zheng','海岛组','ACTIVE_PLAYER',true,true,true),
    ('yifan yu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('junheng liu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('luyi sun','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('ruochen xu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('moshuang xu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('siran li','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('chulan fan','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('qianyi wang','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('zixi wang','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('jialai jin','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('fangzhou chen','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('zimin jin',null::text,'PRINCIPAL',false,false,false),
    ('anrong',null::text,'PRINCIPAL',false,false,false)
  ), fixed_cast(login_name,story_role) as (values
    ('yifan yu','OFFICIANT'),
    ('xingcheng jin','RING_KEEPER'),
    ('andao chen','RING_KEEPER'),
    ('siran li','GROOM_CHEERLEADER'),
    ('moshuang xu','BRIDE_CHEERLEADER')
  )
  select
    (select count(*) from expected)=33
    and (select count(*) from guests where active)=33
    and not exists(
      select 1 from expected e
      left join guests g on g.active and lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=e.login_name
      where g.id is null or not g.uses_app
        or (e.team is not null and g.team is distinct from e.team)
        or g.participation_mode is distinct from e.participation_mode
        or g.phase_two_eligible is distinct from e.phase_two_eligible
        or g.eligible_for_mission is distinct from e.eligible_for_mission
        or g.eligible_for_personal_score is distinct from e.eligible_for_personal_score
        or (e.team is not null and not g.team_locked)
    )
    and not exists(
      select 1 from guests g where g.active and not exists(
        select 1 from expected e
        where e.login_name=lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))
      )
    )
    and not exists(
      select 1 from fixed_cast e
      left join guests g on g.active and lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=e.login_name
      where g.id is null or g.story_role is distinct from e.story_role
        or not g.role_locked or g.eligible_for_secret_role or g.role<>'guest'
    )
    and not exists(
      select 1 from guests g where g.active and g.story_role<>'NONE'
        and (g.role='spy' or g.story_role not in(
          'OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','HEART_HOLDER','STAR_HOLDER'))
    )
    and (select count(*) from guests where active and story_role='OFFICIANT')=1
    and (select count(*) from guests where active and story_role='RING_KEEPER')=2
    and (select count(*) from guests where active and story_role='GROOM_CHEERLEADER')=1
    and (select count(*) from guests where active and story_role='BRIDE_CHEERLEADER')=1
    and not exists(
      select 1 from guests where active
        and lower(regexp_replace(trim(login_name),'\s+',' ','g')) in('feifei xie','luyi sun','yirui zhang')
        and (not role_locked or eligible_for_secret_role or role<>'guest')
    );
$$;

-- Any superseded dinner assignment, including an old approved rehearsal row,
-- must stop appearing as a live mission.  Its ledger and timestamps remain in
-- place, and the previous status is retained in the immutable audit record.
with legacy as (
  select a.id,a.status as previous_status,t.id as task_id,t.title
  from assignments a
  join tasks t on t.id=a.task_id
  where (t.stage='task_round_2' or coalesce(t.mission_code,'') like 'P2-%')
    and coalesce(t.mission_code,'') not in(
      'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004','P2-CEREMONY-001',
      'P2-HEART-001','P2-STAR-001','P2-LONELY-001','P2-GUIDE-001','P2-TRICKSTER-001',
      'P2-POWER-001','P2-LUCKY-001'
    )
    and a.status<>'cancelled'
), retired as (
  update assignments a set
    status='cancelled',
    cancelled_at=coalesce(a.cancelled_at,now()),
    rejection_reason='剧情调整：旧版第二轮任务已停用'
  from legacy l
  where a.id=l.id
  returning a.id,l.previous_status,l.task_id,l.title
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_phase_two_assignment.cancelled','assignment',id::text,
  jsonb_build_object('previous_status',previous_status,'task_id',task_id,'title',title,
    'points_ledger_preserved',true,'evidence_preserved',true)
from retired;

with retired as (
  update tasks set active=false
  where (stage='task_round_2' or coalesce(mission_code,'') like 'P2-%')
    and coalesce(mission_code,'') not in(
      'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004','P2-CEREMONY-001',
      'P2-HEART-001','P2-STAR-001','P2-LONELY-001','P2-GUIDE-001','P2-TRICKSTER-001',
      'P2-POWER-001','P2-LUCKY-001'
    )
    and active
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_phase_two_task.retired','tasks','batch',
  jsonb_build_object('count',count(*),'official_task_count',12)
from retired;

-- The original 202607280009 seed also left six mission-code-less group tasks
-- active. They are not part of the approved wedding plan, but their generic
-- shape made them look like legitimate custom tasks in admin/station. Match
-- this one obsolete seed set by exact title so future organizer-created custom
-- group tasks remain supported.
with legacy as (
  select a.id,a.status as previous_status,t.id as task_id,t.title
  from assignments a
  join tasks t on t.id=a.task_id
  where t.mission_code is null
    and t.stage='group_game'
    and t.category='group'
    and t.title in('团队记录员','十秒提醒','意见收集者','最终答题人','友好挑战','讨论总结')
    and a.status<>'cancelled'
), retired as (
  update assignments a set
    status='cancelled',
    cancelled_at=coalesce(a.cancelled_at,now()),
    rejection_reason='剧情调整：旧版团队任务已停用'
  from legacy l
  where a.id=l.id
  returning a.id,l.previous_status,l.task_id,l.title
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_group_assignment.cancelled','assignment',id::text,
  jsonb_build_object('previous_status',previous_status,'task_id',task_id,'title',title,
    'points_ledger_preserved',true,'evidence_preserved',true)
from retired;

with retired as (
  update tasks set active=false
  where mission_code is null
    and stage='group_game'
    and category='group'
    and title in('团队记录员','十秒提醒','意见收集者','最终答题人','友好挑战','讨论总结')
    and active
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_group_task.retired','tasks','batch',
  jsonb_build_object('count',count(*),'future_custom_group_tasks_preserved',true)
from retired;

-- Retire the remaining pre-production task seeds. They have no official
-- mission code and were the source of obsolete missions such as “婚礼记者”
-- reappearing during later rehearsals. Organizer-created tasks are not matched
-- by this exact legacy title set and remain untouched.
with legacy as (
  select a.id,a.status as previous_status,t.id as task_id,t.title
  from assignments a join tasks t on t.id=a.task_id
  where t.mission_code is null and t.title in(
    '秘密关键词','合影挑战','回忆收集','祝福传递','轻微干扰','错误线索','秘密引导','线索信使',
    '新朋友合影','跨组碰杯','婚礼封面照','五年故事','同月生日','城市交换','爱的关键词','最佳摄影师',
    '祝福收藏家','跨组击掌','婚礼侦察员','温柔照顾','长辈祝福','甜蜜发现','新人关键词','安静的掌声',
    '疑云制造','方向偏移','低调反对','无害误会','观察提醒','讨论引导','线索守护','温柔纠偏',
    '三组同框','电影海报','五人签名','共同记忆','秘密口令','团队队长','爱心拼图','婚礼记者',
    '团队记录员','十秒提醒','意见收集者','最终答题人','友好挑战','讨论总结','隐藏补给','孤独丘比特奖'
  ) and a.status<>'cancelled'
), retired_seed_assignments as (
  update assignments a set status='cancelled',cancelled_at=coalesce(a.cancelled_at,now()),
    rejection_reason='剧情调整：旧版预设任务已停用'
  from legacy l where a.id=l.id
  returning a.id,l.previous_status,l.task_id,l.title
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_seed_assignment.cancelled','assignment',id::text,
  jsonb_build_object('previous_status',previous_status,'task_id',task_id,'title',title,
    'points_ledger_preserved',true,'evidence_preserved',true)
from retired_seed_assignments;

with retired_seed_tasks as (
  update tasks set active=false
  where mission_code is null and title in(
    '秘密关键词','合影挑战','回忆收集','祝福传递','轻微干扰','错误线索','秘密引导','线索信使',
    '新朋友合影','跨组碰杯','婚礼封面照','五年故事','同月生日','城市交换','爱的关键词','最佳摄影师',
    '祝福收藏家','跨组击掌','婚礼侦察员','温柔照顾','长辈祝福','甜蜜发现','新人关键词','安静的掌声',
    '疑云制造','方向偏移','低调反对','无害误会','观察提醒','讨论引导','线索守护','温柔纠偏',
    '三组同框','电影海报','五人签名','共同记忆','秘密口令','团队队长','爱心拼图','婚礼记者',
    '团队记录员','十秒提醒','意见收集者','最终答题人','友好挑战','讨论总结','隐藏补给','孤独丘比特奖'
  ) and active
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130003','legacy_seed_task.retired','tasks','batch',
  jsonb_build_object('count',count(*),'future_custom_tasks_preserved',true)
from retired_seed_tasks;

-- Repair rehearsal profiles created by the older generator. There is one
-- story captain (the unmatched star), while the two extra votes are separate
-- powers with exactly one recipient per competitive team.
update phase_two_profiles set
  extra_vote=(primary_mission='EXTRA_VOTE'),
  super_lucky=(primary_mission='SUPER_LUCKY'),
  is_captain=(primary_mission='TEAM_CAPTAIN'),updated_at=now()
where true;

create or replace function phase_two_official_assignment_set_complete()
returns boolean
language plpgsql
volatile
security definer
set search_path=public
as $$
begin
  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where unlocked_at is not null)<>20
      or (select count(*) from phase_two_profiles where team='海岛组')<>10
      or (select count(*) from phase_two_profiles where team='沙漠组')<>10
      or (select count(*) from guests where active and uses_app and participation_mode='ACTIVE_PLAYER'
          and phase_two_eligible and drawn_at is not null and team='海岛组')<>10
      or (select count(*) from guests where active and uses_app and participation_mode='ACTIVE_PLAYER'
          and phase_two_eligible and drawn_at is not null and team='沙漠组')<>10
      or exists(select 1 from guests where active and uses_app and participation_mode='ACTIVE_PLAYER'
          and phase_two_eligible and drawn_at is not null and team not in('海岛组','沙漠组'))
      or (select count(*) from phase_two_profiles where primary_mission='TOAST_GROOM_FATHER')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TOAST_BRIDE_MOTHER')<>1
      or (select count(*) from phase_two_profiles where primary_mission='INTERACT_WITH_GROOM')<>1
      or (select count(*) from phase_two_profiles where primary_mission='INTERACT_WITH_BRIDE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>1
      or (select count(*) from phase_two_profiles where is_captain)<>1 then
    return false;
  end if;

  if exists(
    select 1 from phase_two_profiles p
    where p.extra_vote is distinct from (p.primary_mission='EXTRA_VOTE')
      or p.super_lucky is distinct from (p.primary_mission='SUPER_LUCKY')
      or p.is_captain is distinct from (p.primary_mission='TEAM_CAPTAIN')
  ) then
    return false;
  end if;

  if exists(
    select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='EXTRA_VOTE')<>1
  ) then
    return false;
  end if;

  if exists(
    select 1
    from phase_two_profiles p
    left join guests g on g.id=p.guest_id
    where g.id is null or not g.active or not g.uses_app
      or g.participation_mode<>'ACTIVE_PLAYER' or not g.phase_two_eligible
      or g.drawn_at is null or g.team is distinct from p.team
      or g.is_hidden_spy
      or (p.primary_mission='TRICKSTER') is distinct from (g.role='spy')
  ) then
    return false;
  end if;

  if exists(
    select 1 from assignments a join tasks t on t.id=a.task_id
    where a.status<>'cancelled'
      and (t.stage='task_round_2' or coalesce(t.mission_code,'') like 'P2-%')
      and coalesce(t.mission_code,'') not in(
        'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004','P2-CEREMONY-001',
        'P2-HEART-001','P2-STAR-001','P2-LONELY-001','P2-GUIDE-001','P2-TRICKSTER-001',
        'P2-POWER-001','P2-LUCKY-001'
      )
  ) then
    return false;
  end if;

  if (
    select count(*)
    from assignments a
    join tasks t on t.id=a.task_id
    where a.status<>'cancelled' and t.active and not t.is_demo
      and t.stage='task_round_2' and t.mission_code like 'P2-%'
  )<>20 then
    return false;
  end if;

  if exists(
    select 1
    from phase_two_profiles p
    left join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
    left join tasks t on t.id=a.task_id and t.active and not t.is_demo
      and t.stage='task_round_2' and t.mission_code like 'P2-%'
    group by p.guest_id,p.primary_mission
    having count(*) filter(where t.mission_code=case p.primary_mission
      when 'TOAST_GROOM_FATHER' then 'P2-SOCIAL-001'
      when 'TOAST_BRIDE_MOTHER' then 'P2-SOCIAL-002'
      when 'INTERACT_WITH_GROOM' then 'P2-SOCIAL-003'
      when 'INTERACT_WITH_BRIDE' then 'P2-SOCIAL-004'
      when 'DINNER_SPEECH' then 'P2-CEREMONY-001'
      when 'HEART_DILEMMA' then 'P2-HEART-001'
      when 'STAR_DILEMMA' then 'P2-STAR-001'
      when 'COPY_SCORE' then 'P2-LONELY-001'
      when 'TEAM_CAPTAIN' then 'P2-GUIDE-001'
      when 'TRICKSTER' then 'P2-TRICKSTER-001'
      when 'EXTRA_VOTE' then 'P2-POWER-001'
      when 'SUPER_LUCKY' then 'P2-LUCKY-001'
    end)<>1
      or count(*) filter(where t.mission_code like 'P2-%')<>1
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function phase_two_official_assignment_set_complete() from public,anon,authenticated,service_role;

create or replace function guard_unlocked_phase_two_profile()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_stage text;
begin
  if current_setting('wedding.rehearsal_reset',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    if old.unlocked_at is not null then
      raise exception using errcode='P0001',message='phase_two_profile_locked';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' and old.unlocked_at is not null then
    if new.guest_id is distinct from old.guest_id
        or new.team is distinct from old.team
        or new.primary_mission is distinct from old.primary_mission
        or new.interaction_theme is distinct from old.interaction_theme
        or new.phase_one_points_snapshot is distinct from old.phase_one_points_snapshot
        or new.unlocked_at is distinct from old.unlocked_at then
      raise exception using errcode='P0001',message='phase_two_profile_locked';
    end if;
    if new.extra_vote is distinct from old.extra_vote
        or new.super_lucky is distinct from old.super_lucky
        or new.is_captain is distinct from old.is_captain then
      select stage into v_stage from game_state where id=1;
      if v_stage<>'ceremony_end'
          or new.extra_vote is distinct from (new.primary_mission='EXTRA_VOTE')
          or new.super_lucky is distinct from (new.primary_mission='SUPER_LUCKY')
          or new.is_captain is distinct from (new.primary_mission='TEAM_CAPTAIN') then
        raise exception using errcode='P0001',message='phase_two_profile_locked';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_unlocked_phase_two_profile on phase_two_profiles;
create trigger guard_unlocked_phase_two_profile
before update or delete on phase_two_profiles
for each row execute function guard_unlocked_phase_two_profile();

create or replace function configure_phase_two_profile(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,p_super_lucky boolean,
  p_is_captain boolean,p_interaction_theme text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  if exists(select 1 from phase_two_profiles where guest_id=p_guest_id and unlocked_at is not null) then
    raise exception using errcode='P0001',message='phase_two_profile_locked';
  end if;
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app
      or v_guest.participation_mode<>'ACTIVE_PLAYER' or not v_guest.phase_two_eligible
      or v_guest.team not in('海岛组','沙漠组') then
    raise exception using errcode='P0001',message='phase_two_guest_ineligible';
  end if;
  if p_primary_mission is not null and p_primary_mission not in(
    'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE',
    'DINNER_SPEECH','HEART_DILEMMA','STAR_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER',
    'EXTRA_VOTE','SUPER_LUCKY') then
    raise exception using errcode='22023',message='invalid_phase_two_mission';
  end if;
  if coalesce(p_extra_vote,false)<>coalesce(p_primary_mission='EXTRA_VOTE',false)
      or coalesce(p_super_lucky,false)<>coalesce(p_primary_mission='SUPER_LUCKY',false)
      or coalesce(p_is_captain,false)<>coalesce(p_primary_mission='TEAM_CAPTAIN',false) then
    raise exception using errcode='22023',message='phase_two_power_must_match_assignment';
  end if;
  if coalesce(p_primary_mission='TRICKSTER',false) is distinct from (v_guest.role='spy') then
    raise exception using errcode='P0001',message='phase_two_trickster_assignment_invalid';
  end if;
  if lower(v_guest.login_name)='yirui zhang' and p_primary_mission is distinct from 'DINNER_SPEECH' then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_required';
  end if;
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at)
  values(v_guest.id,v_guest.team,p_primary_mission,coalesce(p_primary_mission='EXTRA_VOTE',false),
    coalesce(p_primary_mission='SUPER_LUCKY',false),coalesce(p_primary_mission='TEAM_CAPTAIN',false),
    trim(coalesce(p_interaction_theme,'')),v_guest.points,now())
  on conflict(guest_id) do update set team=excluded.team,primary_mission=excluded.primary_mission,
    extra_vote=excluded.extra_vote,super_lucky=excluded.super_lucky,is_captain=excluded.is_captain,
    interaction_theme=excluded.interaction_theme,phase_one_points_snapshot=excluded.phase_one_points_snapshot,
    updated_at=now();
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.profile_configure','guest',p_guest_id::text,jsonb_build_object(
    'primary_mission',p_primary_mission,'power_matches_assignment',true));
end;
$$;

create or replace function set_game_stage(p_stage text,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_phase_two_count integer:=0;
begin
  if p_stage not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then
    raise exception using errcode='P0001',message='use_voting_controls';
  end if;

  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  if v_state.results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  if p_stage=v_state.stage then
    return;
  end if;
  if not (
    (v_state.stage='registration' and p_stage='waiting')
    or (v_state.stage='waiting' and p_stage='task_round_1')
    or (v_state.stage='task_round_1' and p_stage='ceremony_end')
    or (v_state.stage='ceremony_end' and p_stage='task_round_2')
    or (v_state.stage='task_round_2' and p_stage='banquet')
    or (v_state.stage='banquet' and p_stage='group_game')
  ) then
    raise exception using errcode='P0001',message='invalid_game_stage_transition';
  end if;

  -- The prelude is the only release point. A direct jump from ceremony_end (or
  -- any earlier stage) to dinner/team play must never skip task creation.
  if p_stage='task_round_2' then
    perform finalize_phase_one_content(p_actor);
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;

  if p_stage in('task_round_2','banquet','group_game')
      and not phase_two_official_assignment_set_complete() then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;

  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now()
  where id=1;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object(
    'previous_stage',v_state.stage,'stage',p_stage,'phase_one_closes_at','task_round_2',
    'ceremony_end_resumes_phase_one',p_stage='ceremony_end','banquet_stage',p_stage='banquet',
    'phase_two_assignments_created',v_phase_two_count,
    'phase_two_complete',case when p_stage in('task_round_2','banquet','group_game') then true else null end));
end;
$$;

revoke all on function set_game_stage(text,text) from public,anon,authenticated;
grant execute on function set_game_stage(text,text) to service_role;

create or replace function set_registration_open(p_value boolean,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if p_value then
    if v_state.voting_open or v_state.results_visible or v_state.stage in('voting','results') then
      raise exception using errcode='P0001',message='registration_during_finale';
    end if;
    if v_state.task_catalog_mode<>'live' or v_state.invitation_code_updated_at is null
        or not formal_wedding_catalog_ready() or not formal_wedding_roster_ready() then
      raise exception using errcode='P0001',message='formal_wedding_preflight_not_ready';
    end if;
  end if;
  update game_state set registration_open=p_value,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.registration_open','game_state','1',jsonb_build_object(
    'value',p_value,'stage',v_state.stage,'database_preflight_enforced',p_value));
end;
$$;

revoke all on function formal_wedding_catalog_ready() from public,anon,authenticated,service_role;
revoke all on function formal_wedding_roster_ready() from public,anon,authenticated,service_role;
revoke all on function guard_unlocked_phase_two_profile() from public,anon,authenticated;
revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function set_registration_open(boolean,text) from public,anon,authenticated;
grant execute on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function set_registration_open(boolean,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130003','phase_two.release_invariants_hardened','game_state','1',jsonb_build_object(
  'competitive_teams',jsonb_build_object('海岛组',10,'沙漠组',10),
  'official_assignments',20,'official_phase_two_tasks',12,
  'direct_stage_bypass_blocked',true,'legacy_assignments_cancelled_not_deleted',true,
  'legacy_group_seed_retired',true,
  'task_copy_authoritative',true));

commit;
