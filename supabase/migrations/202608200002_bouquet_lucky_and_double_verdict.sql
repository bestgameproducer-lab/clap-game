-- Retire the two fixed cheerleader cards, replace them with two randomly drawn
-- bouquet cards, make both first-act lucky stars own the same second-act main
-- ability, and let Double Verdict double both ballot weight and a correct vote
-- reward. Existing approved history is preserved; unfinished cheerleader cards
-- are converted only so an in-progress rehearsal never loses its task panel.

begin;

select set_config('wedding.rehearsal_reset','on',true);

alter table tasks disable trigger guard_retired_and_official_task_catalog;
alter table tasks disable trigger guard_live_custom_task_catalog;
alter table assignments disable trigger guard_live_custom_task_assignment;

insert into tasks(
  title,description,verification_method,points,role_scope,category,stage,active,is_demo,
  story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,
  max_assignments,grants_hidden_spy,formal_allowed
)
values(
  '手捧花的幸运',
  '仪式结束后，如果你接到手捧花，或由新人亲手将手捧花送给你，即可获得 8 点个人积分。请不要争抢或打扰仪式；只有真实获得手捧花才算完成。',
  '由主持人确认你在仪式结束后接到或获得手捧花。',
  8,'guest','ceremony','task_round_1',true,false,
  'NONE','P1-BOUQUET-001','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',
  2,false,true
)
on conflict(mission_code) do update set
  title=excluded.title,
  description=excluded.description,
  verification_method=excluded.verification_method,
  points=excluded.points,
  role_scope=excluded.role_scope,
  category=excluded.category,
  stage=excluded.stage,
  active=excluded.active,
  is_demo=excluded.is_demo,
  story_role_scope=excluded.story_role_scope,
  mechanic=excluded.mechanic,
  score_policy=excluded.score_policy,
  assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,
  max_assignments=excluded.max_assignments,
  grants_hidden_spy=excluded.grants_hidden_spy,
  formal_allowed=excluded.formal_allowed;

-- Keep an already-open rehearsal usable until the organizer clears it. These
-- rows are test data; a clean rehearsal draw uses the random allocator below.
with bouquet as (
  select id from tasks where mission_code='P1-BOUQUET-001'
), converted as (
  update assignments a
  set task_id=bouquet.id,
      status='assigned',
      completion_note='',
      evidence_path=null,
      evidence_uploaded_at=null,
      submitted_at=null,
      verified_at=null,
      approved_at=null,
      rejected_at=null,
      cancelled_at=null,
      rejection_reason='',
      verification_note=''
  from tasks retired,bouquet
  where a.task_id=retired.id
    and retired.mission_code in('P1-CER-003','P1-CER-004')
    and a.status in('assigned','submitted','rejected')
  returning a.id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608200002','mission.cheerleader_converted','assignments','batch',
  jsonb_build_object('count',count(*),'temporary_rehearsal_continuity',true)
from converted;

update tasks
set active=false,formal_allowed=false
where mission_code in('P1-CER-003','P1-CER-004');

update tasks
set title='双重裁决',
    description='最终投票时你仍只选择一名本队玩家，系统会自动将你的选择按两票计算。如果本队成功抓出恶作剧者且你投对，个人投票奖励也会从 2 分翻倍为 4 分；投错仍为 1 分，未抓住则为 0 分。身份揭晓前请保密。',
    verification_method='第二阶段开启时由系统立即标记完成；最终投票自动按两票计算，并在投对且成功抓捕时发放 4 分。'
where mission_code='P2-POWER-001';

update tasks
set max_assignments=2,assignment_mode='FIXED'
where mission_code='P2-LUCKY-001';

create or replace function complete_phase_two_extra_vote_assignments(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_completed integer:=0;
begin
  update assignments a
  set status='approved',
      approved_at=coalesce(a.approved_at,now()),
      submitted_at=coalesce(a.submitted_at,now()),
      verified_at=coalesce(a.verified_at,now()),
      verified_by=coalesce(a.verified_by,p_actor),
      verification_note='双重裁决已解锁：最终投票按两票计算，成功抓捕且投对时获得 4 分',
      rejection_reason=null
  from tasks t,phase_two_profiles p
  where a.task_id=t.id and a.guest_id=p.guest_id
    and a.status in('assigned','submitted','rejected')
    and t.mission_code='P2-POWER-001'
    and t.formal_allowed and t.active
    and t.mechanic='INSTANT_BONUS' and t.score_policy='NO_PERSONAL'
    and p.primary_mission='EXTRA_VOTE' and p.extra_vote
    and p.unlocked_at is not null;
  get diagnostics v_completed=row_count;

  if v_completed>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.extra_vote_assignments_complete','game_state','1',jsonb_build_object(
      'completed_assignments',v_completed,'mission_code','P2-POWER-001',
      'points_awarded_at_unlock',0,'completion_rank_awarded',false,'clues_awarded',0,
      'ballot_weight',2,'captured_correct_vote_points',4
    ));
  end if;
  return v_completed;
end;
$$;

revoke all on function complete_phase_two_extra_vote_assignments(text)
  from public,anon,authenticated,service_role;

create or replace function settle_phase_two_lucky(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_profile phase_two_profiles%rowtype;
  v_assignment_id uuid;
  v_initial_lucky boolean;
  v_awarded integer;
  v_total integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-lucky-settlement-v4'));
  for v_profile in
    select p.* from phase_two_profiles p join guests g on g.id=p.guest_id
    where p.super_lucky and p.primary_mission='SUPER_LUCKY'
      and lower(g.login_name) in('feifei xie','luyi sun')
    order by lower(g.login_name) for update of p
  loop
    if v_profile.unlocked_at is null or v_profile.lucky_bonus_settled_at is not null then
      continue;
    end if;
    select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_profile.guest_id and a.status<>'cancelled'
      and t.mission_code='P2-LUCKY-001' limit 1 for update of a;
    if v_assignment_id is null then
      raise exception using errcode='P0001',message='phase_two_assignment_missing';
    end if;
    select exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_profile.guest_id and a.is_initial and t.mission_code='P1-BONUS-001')
    into v_initial_lucky;
    if not v_initial_lucky then
      raise exception using errcode='P0001',message='fixed_lucky_origin_missing';
    end if;
    v_awarded:=greatest(coalesce(v_profile.phase_one_points_snapshot,0),0)+2;
    if v_awarded>0 then
      update guests set points=points+v_awarded where id=v_profile.guest_id;
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_profile.guest_id,v_assignment_id,v_awarded,
        '超级幸运星 · 第一幕积分快照 + 2',p_actor);
    end if;
    update phase_two_profiles set lucky_bonus_settled_at=now(),updated_at=now()
    where guest_id=v_profile.guest_id;
    update assignments set status='approved',approved_at=coalesce(approved_at,now()),
      verified_at=coalesce(verified_at,now()),verification_note='超级幸运星已结算：第一幕积分快照 + 2'
    where id=v_assignment_id and status<>'approved';
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.lucky_settle','guest',v_profile.guest_id::text,jsonb_build_object(
      'snapshot_points',v_profile.phase_one_points_snapshot,'fixed_bonus',2,
      'awarded',v_awarded,'fixed_primary_super_lucky',true,'settled_immediately',true));
    v_total:=v_total+v_awarded;
  end loop;
  return v_total;
end;
$$;

revoke all on function settle_phase_two_lucky(text) from public,anon,authenticated;
grant execute on function settle_phase_two_lucky(text) to service_role;

alter table assignments enable trigger guard_live_custom_task_assignment;
alter table tasks enable trigger guard_live_custom_task_catalog;
alter table tasks enable trigger guard_retired_and_official_task_catalog;

-- Siran and Moshuang return to the ordinary competitive draw pool. A reset
-- now keeps them unfixed, so either may draw any eligible random card or role.
update guests
set story_role='NONE',
    ceremony_eligible=false,
    role_locked=false,
    eligible_for_secret_role=true,
    hidden_role='NONE'
where lower(regexp_replace(trim(login_name),'\s+',' ','g')) in('siran li','moshuang xu');

create or replace function is_official_wedding_mission_code(p_code text)
returns boolean
language sql
immutable
security invoker
set search_path=public
as $$
  select coalesce(p_code,'')=any(array[
    'P1-CER-001','P1-CER-002','P1-BOUQUET-001',
    'P1-HEART-001','P1-STAR-001','P1-SOCIAL-001','P1-SOCIAL-002',
    'P1-BONUS-001','P1-TRICKSTER-001',
    'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004',
    'P2-CEREMONY-001','P2-HEART-001','P2-STAR-001','P2-LONELY-001',
    'P2-GUIDE-001','P2-TRICKSTER-001','P2-POWER-001','P2-LUCKY-001'
  ]::text[])
$$;

revoke all on function is_official_wedding_mission_code(text)
  from public,anon,authenticated,service_role;

create or replace function formal_wedding_catalog_ready()
returns boolean language sql stable security definer set search_path=public as $$
  with expected(
    mission_code,title,description,verification_method,points,max_assignments,
    role_scope,category,stage,story_role_scope,mechanic,score_policy,
    assignment_mode,verification_type,active,is_demo,grants_hidden_spy
  ) as (values
    ('P1-CER-001','誓词引导人','请在工作人员通知后到达指定位置，引导新人完成誓词。不要提前上台或公开任务。','由主持人确认流程沟通、到位及誓词引导均已完成。',5,1,'guest','ceremony','task_round_1','OFFICIANT','STANDARD','STANDARD','FIXED','HOST_CONFIRM',true,false,false),
    ('P1-CER-002','戒指守护者','请在工作人员通知后领取指定戒指盒，并在交换戒指环节按照提示送到新人身边。','由主持人确认戒指已经安全送达。',3,2,'guest','ceremony','task_round_1','RING_KEEPER','STANDARD','STANDARD','FIXED','HOST_CONFIRM',true,false,false),
    ('P1-BOUQUET-001','手捧花的幸运','仪式结束后，如果你接到手捧花，或由新人亲手将手捧花送给你，即可获得 8 点个人积分。请不要争抢或打扰仪式；只有真实获得手捧花才算完成。','由主持人确认你在仪式结束后接到或获得手捧花。',8,2,'guest','ceremony','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',true,false,false),
    ('P1-HEART-001','寻找爱心伙伴','找到持有相反半边的爱心玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。',2,5,'guest','standard','task_round_1','HEART_HOLDER','HEART_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',true,false,false),
    ('P1-STAR-001','寻找星星伙伴','找到持有相反半边的星星玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。','一方发起邀请、另一方接受，或由工作人员确认。',2,5,'guest','standard','task_round_1','STAR_HOLDER','STAR_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',true,false,false),
    ('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。',2,3,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P1-SOCIAL-002','拍摄一张新郎新娘同框的照片','在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。','上传照片或向任务站工作人员出示照片。',2,3,'all','standard','task_round_1','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P1-BONUS-001','丘比特幸运星','丘比特今天格外眷顾你。你不需要完成额外任务，打开卡片后立即获得2点个人积分。','系统自动完成。',2,2,'guest','standard','task_round_1','NONE','INSTANT_BONUS','STANDARD','FIXED','SYSTEM_CONFIRM',true,false,false),
    ('P1-TRICKSTER-001','寻找恶作剧者同伴','先用秘密暗号确认对方身份。确认暗号后，一方输入对方玩家编号发出邀请，对方在自己的页面接受即可建立同伴关系。','一方发起秘密邀请、另一方接受；系统记录同伴关系。',0,null::integer,'spy','hidden','task_round_1','NONE','TRICKSTER_SIGNAL','NO_PERSONAL','ROLE_FIXED','MUTUAL_CONFIRM',true,false,false),
    ('P2-SOCIAL-001','来自丘比特的敬意','请在晚宴期间找到新郎的爸爸，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P2-SOCIAL-002','来自丘比特的祝福','请在晚宴期间找到新娘的妈妈，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P2-SOCIAL-003','新郎特别任务','找到新郎，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新郎的重要流程。','上传符合指定主题的合影。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P2-SOCIAL-004','新娘特别任务','找到新娘，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新娘的重要流程。','上传符合指定主题的合影。',3,1,'guest','standard','task_round_2','NONE','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',true,false,false),
    ('P2-CEREMONY-001','晚宴致辞人','请准备一段一至三分钟、真诚且不过度私密的新人祝福，并在主持人指定时间完成致辞。','由主持人或主办方确认。',5,1,'guest','ceremony','task_round_2','NONE','STANDARD','STANDARD','FIXED','HOST_CONFIRM',true,false,false),
    ('P2-HEART-001','爱与恨的秘密选择','你和爱心伙伴必须各自秘密选择“爱”或“恨”，全程不能商量、暗示或展示页面。双方都选爱：各得 3 分；一方选爱、一方选恨：爱为 0 分、恨为 5 分；双方都选恨：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-STAR-001','星光抉择','你和星光伙伴必须各自秘密选择“同行”或“独占”，全程不能商量、暗示或展示页面。双方都选同行：各得 3 分；一方同行、一方独占：同行为 0 分、独占为 5 分；双方都选独占：各得 1 分。','双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',0,4,'guest','standard','task_round_2','NONE','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-LONELY-001','孤单丘比特 · 偷心行动','第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并秘密锁定目标；最终揭晓时，你会从对方转移 3 点个人积分到自己（对方 -3，你 +3）。目标一旦提交不能修改，分数不足 3 点时也会完整扣除，你的选择需要保密。','在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时自动转移 3 点个人积分。',0,1,'guest','standard','task_round_2','NONE','COPY_SCORE','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-GUIDE-001','领航星 · 带领团队','第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；只要全场最高团队分大于 0，本队取得第一或并列第一时，你将获得 4 点个人积分。若两队都是 0 分，则没有第一名奖励。','领航星身份可以公开；系统按最终团队积分自动结算。正分并列第一同样获奖，双方均为 0 分时不发第一名奖励。',0,1,'guest','standard','task_round_2','NONE','TEAM_CAPTAIN','NO_PERSONAL','RELATIONSHIP','SYSTEM',true,false,false),
    ('P2-TRICKSTER-001','丘比特的恶作剧者','尽可能让自己的团队在晚宴游戏中失去优势，同时隐藏身份。不得破坏婚礼、设备或他人手机。','最终投票与团队排名自动结算。',0,2,'guest','hidden','task_round_2','NONE','TRICKSTER_MISSION','NO_PERSONAL','ROLE_FIXED','SYSTEM',true,false,false),
    ('P2-POWER-001','双重裁决','最终投票时你仍只选择一名本队玩家，系统会自动将你的选择按两票计算。如果本队成功抓出恶作剧者且你投对，个人投票奖励也会从 2 分翻倍为 4 分；投错仍为 1 分，未抓住则为 0 分。身份揭晓前请保密。','第二阶段开启时由系统立即标记完成；最终投票自动按两票计算，并在投对且成功抓捕时发放 4 分。',0,2,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','CONTROLLED_RANDOM','SYSTEM',true,false,false),
    ('P2-LUCKY-001','超级幸运星','你从第一幕的“丘比特幸运星”升级为“超级幸运星”。第二幕开启时，系统会立即发放“第一阶段积分快照 + 2”的额外个人分，并自动完成此能力；无需再次提交。','第二阶段开启时由系统立即结算并标记完成；无需手动提交。',0,2,'guest','hidden','task_round_2','NONE','INSTANT_BONUS','NO_PERSONAL','FIXED','SYSTEM',true,false,false)
  )
  select
    (select count(*) from expected)=21
    and not exists(
      select 1 from expected e
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
    ('andao chen','RING_KEEPER')
  )
  select
    (select count(*) from expected)=32
    and (select count(*) from guests where active)=32
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
          'OFFICIANT','RING_KEEPER','HEART_HOLDER','STAR_HOLDER'))
    )
    and (select count(*) from guests where active and story_role='OFFICIANT')=1
    and (select count(*) from guests where active and story_role='RING_KEEPER')=2
    and not exists(
      select 1 from guests where active
        and lower(regexp_replace(trim(login_name),'\s+',' ','g')) in('feifei xie','luyi sun','yirui zhang')
        and (not role_locked or eligible_for_secret_role or role<>'guest')
    );
$$;

create or replace function configure_guest_story_role_before_final_lock(
  p_guest_id uuid,p_story_role text,p_actor text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_guest guests%rowtype; v_limit integer; v_used integer;
begin
  if p_story_role not in('NONE','OFFICIANT','RING_KEEPER','HEART_HOLDER','STAR_HOLDER') then
    raise exception using errcode='22023',message='invalid_story_role';
  end if;
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' then raise exception using errcode='P0001',message='story_role_active_player_required'; end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  v_limit:=case p_story_role when 'RING_KEEPER' then 2 when 'HEART_HOLDER' then 5
    when 'STAR_HOLDER' then 5 when 'NONE' then 999 else 1 end;
  if p_story_role<>'NONE' then
    select count(*)::integer into v_used from guests where active and story_role=p_story_role and id<>p_guest_id;
    if v_used>=v_limit then raise exception using errcode='P0001',message='story_role_capacity_full'; end if;
  end if;
  update guests set story_role=p_story_role,
    ceremony_eligible=p_story_role in('OFFICIANT','RING_KEEPER'),
    eligible_for_secret_role=p_story_role='NONE',
    hidden_role=case when p_story_role='NONE' then hidden_role else 'NONE' end,
    role=case when p_story_role<>'NONE' then 'guest' else role end,
    role_locked=case when p_story_role<>'NONE' then true else role_locked end
  where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.story_role_configure','guest',p_guest_id::text,
    jsonb_build_object('previous_story_role',v_guest.story_role,'story_role',p_story_role));
end;
$$;

revoke all on function configure_guest_story_role_before_final_lock(uuid,text,text)
  from public,anon,authenticated,service_role;

-- Add the two-card bouquet capacity to the server-authoritative random draw.
do $draw_patch$
declare
  v_definition text;
  v_updated text;
  v_anchor text:=$anchor$      or (t.mission_code in ('P1-SOCIAL-001', 'P1-SOCIAL-002') and ($anchor$;
  v_replacement text:=$replacement$      or (v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001' and
        (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
          where a.task_id=t.id and a.is_initial and assigned_guest.phase_two_eligible)<2)
      or (t.mission_code in ('P1-SOCIAL-001', 'P1-SOCIAL-002') and ($replacement$;
begin
  select pg_get_functiondef('public.draw_guest_card_before_final_lock(uuid)'::regprocedure)
  into v_definition;
  if position('P1-BOUQUET-001' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      -- PostgreSQL versions differ only in whitespace around IN lists.
      v_anchor:=$anchor$      or (t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') and ($anchor$;
      v_replacement:=$replacement$      or (v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001' and
        (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
          where a.task_id=t.id and a.is_initial and assigned_guest.phase_two_eligible)<2)
      or (t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') and ($replacement$;
    end if;
    if position(v_anchor in v_definition)=0 then
      raise exception using errcode='P0001',message='bouquet_draw_patch_anchor_missing';
    end if;
    v_updated:=replace(v_definition,v_anchor,v_replacement);
    execute v_updated;
  end if;
end;
$draw_patch$;

create or replace function guard_bouquet_submission_after_ceremony()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_stage text; v_mission_code text;
begin
  if new.status not in('submitted','approved') or new.status is not distinct from old.status then
    return new;
  end if;
  select mission_code into v_mission_code from tasks where id=new.task_id;
  if v_mission_code<>'P1-BOUQUET-001' then return new; end if;
  select stage into v_stage from game_state where id=1;
  if v_stage not in('ceremony_end','task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='bouquet_confirmation_wait_for_ceremony_end';
  end if;
  return new;
end;
$$;

revoke all on function guard_bouquet_submission_after_ceremony()
  from public,anon,authenticated,service_role;

drop trigger if exists guard_bouquet_submission_after_ceremony on assignments;
create trigger guard_bouquet_submission_after_ceremony
before update of status on assignments
for each row execute function guard_bouquet_submission_after_ceremony();

-- Both fixed first-act lucky stars now receive the exact same primary ability.
create or replace function unlock_phase_two_missions_assignments_v1(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing integer;
  v_team text;
  v_task_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-unlock-v4'));

  select count(*)::integer into v_existing
  from assignments a join tasks t on t.id=a.task_id
  where a.status<>'cancelled' and t.stage='task_round_2' and t.mission_code like 'P2-%';
  if v_existing>0 then return v_existing; end if;

  if (select count(*) from guests
      where active and uses_app and participation_mode='ACTIVE_PLAYER'
        and phase_two_eligible and drawn_at is not null and not is_hidden_spy)<>20
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and not is_hidden_spy and team='海岛组')<>10
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and not is_hidden_spy and team='沙漠组')<>10
      or exists(
        select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
        where (select count(*) from guests g
          where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
            and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
            and g.team=expected.team and g.role='spy')<>1
      ) then
    raise exception using errcode='P0001',message='phase_two_roster_not_ready';
  end if;

  if (select count(*) from guests
      where active and uses_app and participation_mode='ACTIVE_PLAYER'
        and phase_two_eligible and drawn_at is not null and unlocked_role='CUPID_ALLIANCE')<>4
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='STAR_ALLIANCE')<>4
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='LONELY_CUPID')<>1
      or (select count(*) from guests
          where active and uses_app and participation_mode='ACTIVE_PLAYER'
            and phase_two_eligible and drawn_at is not null and unlocked_role='GUIDING_STAR')<>1 then
    raise exception using errcode='P0001',message='phase_two_relationship_roles_not_ready';
  end if;

  delete from phase_two_profiles where true;

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'TRICKSTER',false,false,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy and g.role='spy';

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'DINNER_SPEECH',false,false,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and lower(g.login_name)='yirui zhang' and g.role='guest';
  if not found then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable';
  end if;

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,
    case g.unlocked_role
      when 'CUPID_ALLIANCE' then 'HEART_DILEMMA'
      when 'STAR_ALLIANCE' then 'STAR_DILEMMA'
      when 'LONELY_CUPID' then 'COPY_SCORE'
      when 'GUIDING_STAR' then 'TEAM_CAPTAIN'
    end,
    false,false,g.unlocked_role='GUIDING_STAR','',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and g.unlocked_role in('CUPID_ALLIANCE','STAR_ALLIANCE','LONELY_CUPID','GUIDING_STAR')
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id);

  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,'SUPER_LUCKY',false,true,false,'',g.points,now()
  from guests g
  where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
    and lower(g.login_name) in('feifei xie','luyi sun')
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id);
  if (select count(*) from phase_two_profiles p join guests g on g.id=p.guest_id
      where p.primary_mission='SUPER_LUCKY'
        and lower(g.login_name) in('feifei xie','luyi sun'))<>2 then
    raise exception using errcode='P0001',message='fixed_lucky_cast_invalid';
  end if;

  foreach v_team in array array['海岛组','沙漠组'] loop
    insert into phase_two_profiles(
      guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
      interaction_theme,phase_one_points_snapshot,updated_at
    )
    select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now()
    from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and g.team=v_team
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
    order by exists(
      select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=g.id and a.is_initial
        and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
    ) desc,random()
    limit 1;
    if not found then
      raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable';
    end if;
  end loop;

  with candidates as (
    select g.id,row_number() over(order by random()) as position
    from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
  ), mission_pool(primary_mission,interaction_theme) as (values
    ('TOAST_GROOM_FATHER',''),
    ('TOAST_BRIDE_MOTHER',''),
    ('INTERACT_WITH_GROOM','与新郎完成一张有故事感的合影'),
    ('INTERACT_WITH_BRIDE','与新娘完成一张有故事感的合影')
  ), missions as (
    select m.*,row_number() over(order by random()) as position from mission_pool m
  )
  insert into phase_two_profiles(
    guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,
    interaction_theme,phase_one_points_snapshot,updated_at
  )
  select g.id,g.team,m.primary_mission,false,false,false,m.interaction_theme,g.points,now()
  from candidates c join missions m using(position) join guests g on g.id=c.id;

  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>2
      or (select count(*) from phase_two_profiles where primary_mission in(
        'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'))<>3
      or exists(
        select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
        where (select count(*) from phase_two_profiles p
          where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
          or (select count(*) from phase_two_profiles p
            where p.team=expected.team and p.primary_mission='EXTRA_VOTE')<>1
      ) then
    raise exception using errcode='P0001',message='phase_two_coverage_invalid';
  end if;

  insert into assignments(guest_id,task_id)
  select p.guest_id,t.id
  from phase_two_profiles p
  join tasks t on t.mission_code=case p.primary_mission
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
  end
  where t.active and not t.is_demo and t.stage='task_round_2'
  on conflict(guest_id,task_id) do nothing;
  get diagnostics v_task_count=row_count;
  if v_task_count<>20 then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;

  update phase_two_profiles set unlocked_at=now(),updated_at=now() where true;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'mission.phase_two_unlock','game_state','1',jsonb_build_object(
    'assignments_created',v_task_count,
    'official_assignment_set',true,
    'one_extra_vote_per_team',true,
    'fixed_primary_lucky_stars',jsonb_build_array('feifei xie','luyi sun'),
    'random_banquet_tasks',3
  ));
  return v_task_count;
end;
$$;

revoke all on function unlock_phase_two_missions_assignments_v1(text)
  from public,anon,authenticated,service_role;

create or replace function phase_two_official_assignment_set_complete()
returns boolean language plpgsql volatile security definer set search_path=public as $$
begin
  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where unlocked_at is not null)<>20
      or (select count(*) from phase_two_profiles where team='海岛组')<>10
      or (select count(*) from phase_two_profiles where team='沙漠组')<>10
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>2
      or (select count(*) from phase_two_profiles where primary_mission in(
        'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'))<>3
      or (select count(*) from phase_two_profiles where is_captain)<>1 then return false;
  end if;
  if exists(
    select 1 from phase_two_profiles p join guests g on g.id=p.guest_id
    where p.super_lucky is distinct from (
        p.primary_mission='SUPER_LUCKY' and lower(g.login_name) in('feifei xie','luyi sun'))
      or p.extra_vote is distinct from (p.primary_mission='EXTRA_VOTE')
      or p.is_captain is distinct from (p.primary_mission='TEAM_CAPTAIN')
  ) then return false; end if;
  if (select count(*) from assignments a join tasks t on t.id=a.task_id
      where a.status<>'cancelled' and t.active and not t.is_demo
        and t.stage='task_round_2' and t.mission_code like 'P2-%')<>20 then return false;
  end if;
  if exists(
    select 1 from phase_two_profiles p
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
      when 'SUPER_LUCKY' then 'P2-LUCKY-001' end)<>1
      or count(*) filter(where t.mission_code like 'P2-%')<>1
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function phase_two_official_assignment_set_complete()
  from public,anon,authenticated,service_role;

create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if exists(select 1 from phase_two_profiles p where p.primary_mission='TEAM_CAPTAIN' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='STAR' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='guiding_star_origin_invalid';
  end if;
  if exists(select 1 from phase_two_profiles p where p.primary_mission='COPY_SCORE' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='HEART' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='lonely_cupid_origin_invalid';
  end if;

  if exists(select 1 from assignments a join tasks t on t.id=a.task_id where t.mission_code like 'P2-%') then
    if phase_two_official_assignment_set_complete() then
      perform settle_phase_two_lucky(p_actor);
      perform complete_phase_two_extra_vote_assignments(p_actor);
      return 20;
    end if;
    raise exception using errcode='P0001',message='phase_two_existing_assignments_incomplete';
  end if;

  delete from phase_two_dilemmas where true;
  delete from phase_two_copy_choices where true;
  v_count:=unlock_phase_two_missions_assignments_v1(p_actor);
  update phase_two_profiles set
    extra_vote=(primary_mission='EXTRA_VOTE'),
    super_lucky=(primary_mission='SUPER_LUCKY'),
    is_captain=(primary_mission='TEAM_CAPTAIN'),updated_at=now();
  if v_count<>20 or not phase_two_official_assignment_set_complete() then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;
  perform settle_phase_two_lucky(p_actor);
  perform complete_phase_two_extra_vote_assignments(p_actor);
  return 20;
end;
$$;

revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
grant execute on function unlock_phase_two_missions(text) to service_role;

-- Double Verdict keeps its weighted ballot and additionally doubles only the
-- correct-vote personal reward. Wrong submitted votes still receive one point
-- when their team catches the trickster; escaped teams still receive zero.
create or replace function settle_voting_results_with_lucky_v1(
  p_voting_round integer,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team record;
  v_vote record;
  v_reward_id bigint;
  v_amount integer;
  v_correct_rewards integer:=0;
  v_double_verdict_rewards integer:=0;
  v_participation_rewards integer:=0;
  v_captured_teams integer:=0;
begin
  if p_voting_round<1 then
    raise exception using errcode='22023',message='voting_not_started';
  end if;

  for v_team in
    select
      spy.id as trickster_id,
      spy.team,
      coalesce((select sum(coalesce(v.vote_weight,1))::integer from votes v
        where v.voting_round=p_voting_round and v.target_guest_id=spy.id),0) as trickster_votes,
      coalesce((select max(tally.total_votes) from (
        select sum(coalesce(v.vote_weight,1))::integer as total_votes
        from votes v join guests voter on voter.id=v.voter_guest_id
        where v.voting_round=p_voting_round and voter.team=spy.team
        group by v.target_guest_id
      ) tally),0) as top_votes
    from guests spy
    where spy.active and spy.uses_app and spy.participation_mode='ACTIVE_PLAYER'
      and spy.phase_two_eligible and spy.drawn_at is not null
      and spy.role='spy' and not spy.is_hidden_spy and spy.team in('海岛组','沙漠组')
  loop
    if v_team.trickster_votes>0 and v_team.trickster_votes=v_team.top_votes then
      v_captured_teams:=v_captured_teams+1;
      for v_vote in
        select
          v.voter_guest_id,
          v.target_guest_id=v_team.trickster_id as is_correct,
          coalesce(p.primary_mission='EXTRA_VOTE' and p.extra_vote,false) as has_double_verdict
        from votes v
        join guests voter on voter.id=v.voter_guest_id
        left join phase_two_profiles p on p.guest_id=v.voter_guest_id
        where v.voting_round=p_voting_round and voter.team=v_team.team
      loop
        v_amount:=case
          when v_vote.is_correct and v_vote.has_double_verdict then 4
          when v_vote.is_correct then 2
          else 1
        end;
        v_reward_id:=null;
        insert into result_rewards(voting_round,reward_type,guest_id,amount,details)
        values(
          p_voting_round,'guest_detective',v_vote.voter_guest_id,v_amount,
          jsonb_build_object(
            'reason',case
              when v_vote.is_correct and v_vote.has_double_verdict then '双重裁决投中并成功抓出本队恶作剧者'
              when v_vote.is_correct then '投中并成功抓出本队恶作剧者'
              else '本队成功抓出恶作剧者的参与奖励'
            end,
            'team',v_team.team,
            'team_caught',true,
            'vote_correct',v_vote.is_correct,
            'double_verdict',v_vote.has_double_verdict,
            'ballot_weight',case when v_vote.has_double_verdict then 2 else 1 end,
            'correct_reward_multiplier',case when v_vote.is_correct and v_vote.has_double_verdict then 2 else 1 end
          )
        )
        on conflict do nothing returning id into v_reward_id;
        if v_reward_id is not null then
          update guests set points=points+v_amount where id=v_vote.voter_guest_id;
          insert into points_ledger(guest_id,amount,reason,actor)
          values(
            v_vote.voter_guest_id,v_amount,
            case
              when v_vote.is_correct and v_vote.has_double_verdict then '终局投票成功追捕并投中恶作剧者 · 双重裁决双倍奖励'
              when v_vote.is_correct then '终局投票成功追捕并投中恶作剧者'
              else '终局投票成功追捕参与奖励'
            end,
            p_actor
          );
          if v_vote.is_correct then
            v_correct_rewards:=v_correct_rewards+1;
            if v_vote.has_double_verdict then
              v_double_verdict_rewards:=v_double_verdict_rewards+1;
            end if;
          else
            v_participation_rewards:=v_participation_rewards+1;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'captured_teams',v_captured_teams,
    'correct_vote_rewards',v_correct_rewards,
    'double_verdict_correct_rewards',v_double_verdict_rewards,
    'participation_rewards',v_participation_rewards,
    'standard_correct_vote_points',2,
    'double_verdict_correct_vote_points',4,
    'other_submitted_vote_points_each',1,
    'escaped_team_vote_points_each',0,
    'weighted_ballots',true,
    'double_verdict_reward_multiplier',2,
    'team_scores_frozen',true
  ));
  return jsonb_build_object(
    'captured_teams',v_captured_teams,
    'correct_vote_rewards',v_correct_rewards,
    'double_verdict_correct_rewards',v_double_verdict_rewards,
    'participation_rewards',v_participation_rewards,
    'standard_correct_vote_points',2,
    'double_verdict_correct_vote_points',4,
    'other_submitted_vote_points_each',1,
    'escaped_team_vote_points_each',0
  );
end;
$$;

revoke all on function settle_voting_results_with_lucky_v1(integer,text)
  from public,anon,authenticated,service_role;

do $verify$
begin
  if not formal_wedding_catalog_ready() then
    raise exception using errcode='P0001',message='formal_catalog_not_ready_after_bouquet_update';
  end if;
  if not formal_wedding_roster_ready() then
    raise exception using errcode='P0001',message='formal_roster_not_ready_after_cheerleader_retirement';
  end if;
end;
$verify$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608200002','rules.bouquet_lucky_double_verdict','game_state','1',
  jsonb_build_object(
    'retired_missions',jsonb_build_array('P1-CER-003','P1-CER-004'),
    'bouquet_mission','P1-BOUQUET-001',
    'bouquet_random_assignments',2,
    'bouquet_points',8,
    'fixed_primary_super_lucky',jsonb_build_array('feifei xie','luyi sun'),
    'phase_two_assignment_count',20,
    'double_verdict_ballot_weight',2,
    'double_verdict_correct_reward',4,
    'approved_history_preserved',true
  ));

commit;
