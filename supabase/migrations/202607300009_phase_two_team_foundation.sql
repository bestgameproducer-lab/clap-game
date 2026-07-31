-- Establish the final three-group roster and a fail-closed phase-two model.
-- Existing runtime records are preserved; this migration does not reset or seed production play data.

begin;

alter table guests add column if not exists phase_two_eligible boolean not null default false;

alter table tasks drop constraint if exists tasks_assignment_mode_check;
alter table tasks add constraint tasks_assignment_mode_check check(assignment_mode in (
  'MANUAL','RANDOM','CONTROLLED_RANDOM','FIXED','RELATIONSHIP','ROLE_FIXED'));
alter table tasks drop constraint if exists tasks_verification_type_check;
alter table tasks add constraint tasks_verification_type_check check(verification_type in (
  'HOST_CONFIRM','STAFF_CONFIRM','PHOTO','MUTUAL_CONFIRM','SYSTEM_CONFIRM','SYSTEM'));
alter table tasks drop constraint if exists tasks_mechanic_check;
alter table tasks add constraint tasks_mechanic_check check(mechanic in (
  'STANDARD','HEART_MATCH','STAR_MATCH','TRICKSTER_SIGNAL','DECOY_DIALOGUE','INSTANT_BONUS',
  'SECRET_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER_MISSION'));

-- The ten family members share one visible group from phase one onward. Seven receive
-- the family card; the two ring keepers and Ziyang still draw phase-one missions.
update guests set team='家人组',team_locked=true,phase_two_eligible=false,
  relationship=case when nullif(trim(relationship),'') is null then '家人' else relationship end
where lower(login_name) in (
  'danying yang','liying jin','jianjun jin','xiaofeng jin','wei jin',
  'huimin xu','gang yao','xingcheng jin','andao chen','ziyang jin'
);

update guests set name='徐辉敏 Huimin Xu',participation_mode='HONOR_GUEST',
  eligible_for_mission=false,eligible_for_secret_role=false,eligible_for_personal_score=false,
  special_card_title='荣誉任务 · 家庭守护者',
  special_card_body='你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。',
  staff_notes='荣誉宾客；第一阶段直接领取家庭卡'
where lower(login_name)='huimin xu';

update guests set participation_mode='HONOR_GUEST',
  eligible_for_mission=false,eligible_for_secret_role=false,eligible_for_personal_score=false,
  special_card_title='荣誉任务 · 家庭守护者',
  special_card_body='你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。',
  staff_notes='荣誉宾客；第一阶段直接领取家庭卡'
where lower(login_name)='gang yao';

update guests set participation_mode='ACTIVE_PLAYER',eligible_for_mission=true,
  eligible_for_secret_role=false,eligible_for_personal_score=true,role='guest',role_locked=true,
  story_role='RING_KEEPER',ceremony_eligible=true
where lower(login_name) in ('xingcheng jin','andao chen');

update guests set participation_mode='ACTIVE_PLAYER',eligible_for_mission=true,
  eligible_for_secret_role=false,eligible_for_personal_score=true,role='guest',role_locked=true
where lower(login_name)='ziyang jin';

-- Lock the twenty competitive players into two balanced teams. The two existing
-- preset tricksters are deliberately separated.
update guests set team='海岛组',team_locked=true,phase_two_eligible=true
where lower(login_name) in (
  'yirui zhang','huijie huang','feifei xie','tang-ling yeh','tianyi shi',
  'wenli xu','yi ren','yue liu','zikun zheng','yifan yu'
);
update guests set team='沙漠组',team_locked=true,phase_two_eligible=true
where lower(login_name) in (
  'junheng liu','luyi sun','ruochen xu','moshuang xu','siran li',
  'chulan fan','qianyi wang','zixi wang','jialai jin','fangzhou chen'
);
update guests set phase_two_eligible=false where participation_mode<>'ACTIVE_PLAYER' or team='家人组';

do $$
declare v_family integer; v_island integer; v_desert integer;
begin
  select count(*) into v_family from guests where active and team='家人组';
  select count(*) into v_island from guests where active and phase_two_eligible and team='海岛组';
  select count(*) into v_desert from guests where active and phase_two_eligible and team='沙漠组';
  if v_family<>10 or v_island<>10 or v_desert<>10 then
    raise exception using errcode='P0001',message='final_group_roster_count_invalid';
  end if;
end $$;

-- Keep historical rows valid while restricting all new operational controls to the two teams.
alter table team_points_ledger drop constraint if exists team_points_ledger_team_check;
alter table team_points_ledger add constraint team_points_ledger_team_check
  check(team in ('玫瑰组','月桂组','星辰组','琥珀组','海岛组','沙漠组'));
alter table awards drop constraint if exists awards_winner_team_check;
alter table awards add constraint awards_winner_team_check
  check(winner_team is null or winner_team in ('玫瑰组','月桂组','星辰组','琥珀组','海岛组','沙漠组'));
alter table result_rewards drop constraint if exists result_rewards_team_check;
alter table result_rewards add constraint result_rewards_team_check
  check(team is null or team in ('玫瑰组','月桂组','星辰组','琥珀组','海岛组','沙漠组'));

insert into team_resources(team,balance) values('海岛组',10),('沙漠组',10)
on conflict(team) do nothing;

create table if not exists phase_two_profiles (
  guest_id uuid primary key references guests(id) on delete cascade,
  team text not null check(team in ('海岛组','沙漠组')),
  primary_mission text check(primary_mission is null or primary_mission in (
    'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE',
    'DINNER_SPEECH','HEART_DILEMMA','STAR_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER')),
  extra_vote boolean not null default false,
  super_lucky boolean not null default false,
  is_captain boolean not null default false,
  interaction_theme text not null default '' check(char_length(interaction_theme)<=120),
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not (primary_mission='TRICKSTER' and (extra_vote or super_lucky))),
  check(not (primary_mission='COPY_SCORE' and super_lucky))
);

create table if not exists phase_two_dilemmas (
  id uuid primary key default gen_random_uuid(),
  alliance_type text not null check(alliance_type in ('HEART','STAR')),
  player_a_id uuid not null references guests(id) on delete cascade,
  player_b_id uuid not null references guests(id) on delete cascade,
  player_a_choice text check(player_a_choice is null or player_a_choice in ('LOVE','HATE','TOGETHER','TAKE_ALL')),
  player_b_choice text check(player_b_choice is null or player_b_choice in ('LOVE','HATE','TOGETHER','TAKE_ALL')),
  player_a_points integer check(player_a_points is null or player_a_points between 0 and 10),
  player_b_points integer check(player_b_points is null or player_b_points between 0 and 10),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check(player_a_id<>player_b_id),
  unique(player_a_id),unique(player_b_id)
);

create table if not exists phase_two_copy_choices (
  guest_id uuid primary key references guests(id) on delete cascade,
  target_guest_id uuid not null references guests(id) on delete restrict,
  settled_points integer,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check(guest_id<>target_guest_id)
);

alter table phase_two_profiles enable row level security;
alter table phase_two_dilemmas enable row level security;
alter table phase_two_copy_choices enable row level security;
revoke all on phase_two_profiles,phase_two_dilemmas,phase_two_copy_choices from public,anon,authenticated;

insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,is_demo,
  story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments)
values
('来自丘比特的敬意','请在晚宴期间找到新郎的爸爸，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,'guest','standard','task_round_2',true,false,'NONE','P2-SOCIAL-001','STANDARD','STANDARD','FIXED','PHOTO',1),
('来自丘比特的祝福','请在晚宴期间找到新娘的妈妈，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。','上传照片或向工作人员展示。',3,'guest','standard','task_round_2',true,false,'NONE','P2-SOCIAL-002','STANDARD','STANDARD','FIXED','PHOTO',1),
('新郎特别任务','找到新郎，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新郎的重要流程。','上传符合指定主题的合影。',3,'guest','standard','task_round_2',true,false,'NONE','P2-SOCIAL-003','STANDARD','STANDARD','FIXED','PHOTO',1),
('新娘特别任务','找到新娘，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新娘的重要流程。','上传符合指定主题的合影。',3,'guest','standard','task_round_2',true,false,'NONE','P2-SOCIAL-004','STANDARD','STANDARD','FIXED','PHOTO',1),
('晚宴致辞人','请准备一段一至三分钟、真诚且不过度私密的新人祝福，并在主持人指定时间完成致辞。','由主持人或主办方确认。',5,'guest','ceremony','task_round_2',true,false,'NONE','P2-CEREMONY-001','STANDARD','STANDARD','FIXED','HOST_CONFIRM',1),
('爱与恨的秘密选择','你与爱心伙伴需要分别秘密选择“爱”或“恨”。选择提交后不可修改，双方提交前不会显示任何结果。','系统等待双方提交后自动结算。',0,'guest','standard','task_round_2',true,false,'NONE','P2-HEART-001','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',4),
('星光抉择','你与星光伙伴需要分别秘密选择“同行”或“独占”。选择提交后不可修改，双方提交前不会显示任何结果。','系统等待双方提交后自动结算。',0,'guest','standard','task_round_2',true,false,'NONE','P2-STAR-001','SECRET_DILEMMA','NO_PERSONAL','RELATIONSHIP','SYSTEM',4),
('命运复制','选择一名其他竞技玩家。第二阶段结算时，你获得与目标本阶段最终个人积分相同的积分；选择后不可修改。','系统在第二阶段最终结算时处理。',0,'guest','standard','task_round_2',true,false,'NONE','P2-LONELY-001','COPY_SCORE','NO_PERSONAL','RELATIONSHIP','SYSTEM',1),
('领航星队长','组织本队完成晚宴团队挑战。如果本队最终排名第一，你将获得 4 点个人积分。','系统根据团队最终排名结算。',0,'guest','standard','task_round_2',true,false,'NONE','P2-GUIDE-001','TEAM_CAPTAIN','NO_PERSONAL','RELATIONSHIP','SYSTEM',1),
('丘比特的恶作剧者','尽可能让自己的团队在晚宴游戏中失去优势，同时隐藏身份。不得破坏婚礼、设备或他人手机。','最终投票与团队排名自动结算。',0,'guest','hidden','task_round_2',true,false,'NONE','P2-TRICKSTER-001','TRICKSTER_MISSION','NO_PERSONAL','ROLE_FIXED','SYSTEM',2)
on conflict(mission_code) do update set title=excluded.title,description=excluded.description,
  verification_method=excluded.verification_method,points=excluded.points,active=true,is_demo=false,
  mechanic=excluded.mechanic,score_policy=excluded.score_policy,assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,max_assignments=excluded.max_assignments;

create or replace function configure_phase_two_profile(
  p_guest_id uuid,p_primary_mission text,p_extra_vote boolean,p_super_lucky boolean,
  p_is_captain boolean,p_interaction_theme text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.phase_two_eligible or v_guest.team not in ('海岛组','沙漠组') then
    raise exception using errcode='P0001',message='phase_two_guest_ineligible';
  end if;
  if p_primary_mission is not null and p_primary_mission not in (
    'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE',
    'DINNER_SPEECH','HEART_DILEMMA','STAR_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER') then
    raise exception using errcode='22023',message='invalid_phase_two_mission';
  end if;
  if p_primary_mission='TRICKSTER' and v_guest.role<>'spy' then raise exception using errcode='P0001',message='phase_two_trickster_required'; end if;
  if v_guest.role='spy' and p_primary_mission is distinct from 'TRICKSTER' then raise exception using errcode='P0001',message='phase_two_trickster_mission_required'; end if;
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,updated_at)
  values(v_guest.id,v_guest.team,p_primary_mission,coalesce(p_extra_vote,false),coalesce(p_super_lucky,false),coalesce(p_is_captain,false),trim(coalesce(p_interaction_theme,'')),now())
  on conflict(guest_id) do update set team=excluded.team,primary_mission=excluded.primary_mission,
    extra_vote=excluded.extra_vote,super_lucky=excluded.super_lucky,is_captain=excluded.is_captain,
    interaction_theme=excluded.interaction_theme,updated_at=now();
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.profile_configure','guest',p_guest_id::text,jsonb_build_object(
    'primary_mission',p_primary_mission,'extra_vote',p_extra_vote,'super_lucky',p_super_lucky,'captain',p_is_captain));
end; $$;

-- Close the obsolete helper value left in the legacy configuration RPC.
create or replace function configure_guest_game_profile(p_guest_id uuid,p_team text,p_role text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  if trim(p_team) not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_role not in ('guest','spy') then raise exception using errcode='22023',message='invalid_role'; end if;
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  if not v_guest.phase_two_eligible then raise exception using errcode='P0001',message='phase_two_guest_ineligible'; end if;
  if p_role='spy' and exists(select 1 from guests g where g.id<>p_guest_id and g.active and g.phase_two_eligible
      and g.team=trim(p_team) and g.role='spy' and not g.is_hidden_spy and (g.drawn_at is not null or g.role_locked)) then
    raise exception using errcode='P0001',message='preset_spy_team_conflict';
  end if;
  update guests set team=trim(p_team),role=p_role,team_locked=true,role_locked=true where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.profile_configure','guest',p_guest_id::text,jsonb_build_object('team',trim(p_team),'role',p_role,'locked',true));
end; $$;

-- Adapt the latest card draw in-place so applied production fixes remain intact.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.draw_guest_card(uuid)'::regprocedure) into v_definition;
  v_definition:=replace(v_definition,$q$'玫瑰组'::text$q$,$q$'海岛组'::text$q$);
  v_definition:=replace(v_definition,$q$'月桂组'::text$q$,$q$'沙漠组'::text$q$);
  v_definition:=replace(v_definition,$q$'星辰组'::text$q$,$q$'海岛组'::text$q$);
  v_definition:=replace(v_definition,$q$'琥珀组'::text$q$,$q$'沙漠组'::text$q$);
  v_definition:=replace(v_definition,$q$'玫瑰组'$q$,$q$'海岛组'$q$);
  v_definition:=replace(v_definition,$q$'月桂组'$q$,$q$'沙漠组'$q$);
  v_definition:=replace(v_definition,$q$'星辰组'$q$,$q$'海岛组'$q$);
  v_definition:=replace(v_definition,$q$'琥珀组'$q$,$q$'沙漠组'$q$);
  v_definition:=replace(v_definition,$q$('海岛组'::text), ('沙漠组'::text), ('海岛组'::text), ('沙漠组'::text)$q$,$q$('海岛组'::text), ('沙漠组'::text)$q$);
  v_definition:=replace(v_definition,$q$('海岛组'),('沙漠组'),('海岛组'),('沙漠组')$q$,$q$('海岛组'),('沙漠组')$q$);
  v_definition:=replace(v_definition,$q$v_team not in ('海岛组','沙漠组','海岛组','沙漠组') or v_capacity>=8$q$,$q$v_team not in ('海岛组','沙漠组','家人组') or (v_team<>'家人组' and v_capacity>=10)$q$);
  v_definition:=replace(v_definition,$q$if v_guest.team_locked then
    v_team:=v_guest.team;$q$,$q$if v_guest.team='家人组' then
    v_team:='家人组';
  elsif v_guest.team_locked then
    v_team:=v_guest.team;$q$);
  v_definition:=regexp_replace(v_definition,
    $q$if v_guest\.team_locked then[[:space:]]+v_team:=v_guest\.team;$q$,
    $q$if v_guest.team='家人组' then
    v_team:='家人组';
  elsif v_guest.team_locked then
    v_team:=v_guest.team;$q$,'i');
  v_definition:=replace(v_definition,'< 8','< 10');
  v_definition:=replace(v_definition,'<8','<10');
  v_definition:=replace(v_definition,'>= 8','>= 10');
  v_definition:=replace(v_definition,'>=8','>=10');
  v_definition:=replace(v_definition,'< 7','< 9');
  v_definition:=replace(v_definition,'<7','<9');
  v_definition:=replace(v_definition,'>= 7','>= 9');
  v_definition:=replace(v_definition,'>=7','>=9');
  if position('玫瑰组' in v_definition)>0 or position('月桂组' in v_definition)>0
      or position('星辰组' in v_definition)>0 or position('琥珀组' in v_definition)>0
      or position($q$v_guest.team='家人组'$q$ in v_definition)=0 then
    raise exception using errcode='P0001',message='phase_two_draw_function_rewrite_incomplete';
  end if;
  execute v_definition;
end;
$migration$;

-- Preserve the latest audited implementations while changing their accepted team set.
do $migration$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array[
    'public.adjust_team_points(text,integer,text,text)',
    'public.adjust_host_team_points(text,integer,text,uuid,text)',
    'public.save_award(uuid,text,uuid,text,text,integer,boolean,text)'
  ] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    v_definition:=replace(v_definition,$q$'玫瑰组'::text$q$,$q$'海岛组'::text$q$);
    v_definition:=replace(v_definition,$q$'月桂组'::text$q$,$q$'沙漠组'::text$q$);
    v_definition:=replace(v_definition,$q$'星辰组'::text$q$,$q$'海岛组'::text$q$);
    v_definition:=replace(v_definition,$q$'琥珀组'::text$q$,$q$'沙漠组'::text$q$);
    v_definition:=replace(v_definition,$q$'玫瑰组'$q$,$q$'海岛组'$q$);
    v_definition:=replace(v_definition,$q$'月桂组'$q$,$q$'沙漠组'$q$);
    v_definition:=replace(v_definition,$q$'星辰组'$q$,$q$'海岛组'$q$);
    v_definition:=replace(v_definition,$q$'琥珀组'$q$,$q$'沙漠组'$q$);
    if position('玫瑰组' in v_definition)>0 or position('月桂组' in v_definition)>0
        or position('星辰组' in v_definition)>0 or position('琥珀组' in v_definition)>0 then
      raise exception using errcode='P0001',message='phase_two_team_function_rewrite_incomplete';
    end if;
    execute v_definition;
  end loop;
end;
$migration$;

revoke all on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function configure_phase_two_profile(uuid,text,boolean,boolean,boolean,text,text) to service_role;
revoke all on function configure_guest_game_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function configure_guest_game_profile(uuid,text,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607300009','phase_two.foundation','game_state','1',jsonb_build_object(
  'family_group',10,'island_group',10,'desert_group',10,'phase_two_profiles',true,
  'runtime_preserved',true,'helper_role_rejected',true));

commit;
