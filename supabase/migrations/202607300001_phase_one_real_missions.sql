-- Phase one real mission system. This migration is forward-only and keeps all
-- previously assigned rehearsal missions readable as historical records.
begin;

alter table guests add column if not exists hidden_role text not null default 'NONE';
alter table guests drop constraint if exists guests_hidden_role_check;
alter table guests add constraint guests_hidden_role_check
  check(hidden_role in ('NONE','CUPID_HELPER'));

alter table guests drop constraint if exists guests_story_role_check;
alter table guests add constraint guests_story_role_check
  check(story_role in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER','STAR_HOLDER'));

alter table guests drop constraint if exists guests_unlocked_role_check;
alter table guests add constraint guests_unlocked_role_check
  check(unlocked_role in ('NONE','CUPID_ALLIANCE','LONELY_CUPID','STAR_ALLIANCE','GUIDING_STAR'));

alter table tasks drop constraint if exists tasks_story_role_scope_check;
alter table tasks add constraint tasks_story_role_scope_check
  check(story_role_scope in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER','STAR_HOLDER'));
alter table tasks add column if not exists assignment_mode text not null default 'RANDOM';
alter table tasks add column if not exists verification_type text not null default 'STAFF_CONFIRM';
alter table tasks add column if not exists max_assignments integer;
alter table tasks drop constraint if exists tasks_assignment_mode_check;
alter table tasks add constraint tasks_assignment_mode_check
  check(assignment_mode in ('MANUAL','RANDOM','CONTROLLED_RANDOM'));
alter table tasks drop constraint if exists tasks_verification_type_check;
alter table tasks add constraint tasks_verification_type_check
  check(verification_type in ('HOST_CONFIRM','STAFF_CONFIRM','PHOTO','MUTUAL_CONFIRM','SYSTEM_CONFIRM'));
alter table tasks drop constraint if exists tasks_max_assignments_check;
alter table tasks add constraint tasks_max_assignments_check
  check(max_assignments is null or max_assignments > 0);
alter table tasks drop constraint if exists tasks_mechanic_check;
alter table tasks add constraint tasks_mechanic_check
  check(mechanic in ('STANDARD','HEART_MATCH','STAR_MATCH','TRICKSTER_SIGNAL','DECOY_DIALOGUE','INSTANT_BONUS'));
alter table tasks drop constraint if exists tasks_personal_point_scale_check;
alter table tasks add constraint tasks_personal_point_scale_check check(points between 0 and 12);

alter table game_state add column if not exists trickster_max_attempts integer not null default 5;
alter table game_state add column if not exists phase_one_completed_at timestamptz;
alter table game_state drop constraint if exists game_state_trickster_max_attempts_check;
alter table game_state add constraint game_state_trickster_max_attempts_check
  check(trickster_max_attempts between 1 and 20);

alter table player_relationships drop constraint if exists player_relationships_relationship_type_check;
alter table player_relationships add constraint player_relationships_relationship_type_check
  check(relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE','TRICKSTER_CONNECTION'));
alter table player_relationships drop constraint if exists player_relationships_status_check;
alter table player_relationships add constraint player_relationships_status_check
  check(status in ('PENDING','ACTIVE','REJECTED','REVEALED'));

create table if not exists symbol_pairing_assignments(
  guest_id uuid primary key references guests(id) on delete cascade,
  symbol text not null check(symbol in ('HEART','STAR')),
  status text not null default 'AVAILABLE' check(status in ('AVAILABLE','PENDING','PAIRED','UNPAIRED_FINAL')),
  partner_guest_id uuid references guests(id) on delete set null,
  pending_relationship_id uuid references player_relationships(id) on delete set null,
  finalized_at timestamptz,
  updated_at timestamptz not null default now(),
  check(guest_id is distinct from partner_guest_id),
  check((status='PAIRED')=(partner_guest_id is not null))
);
create index if not exists symbol_pairing_symbol_status_idx
  on symbol_pairing_assignments(symbol,status);
alter table symbol_pairing_assignments enable row level security;
revoke all on symbol_pairing_assignments from public,anon,authenticated;

create table if not exists cupid_helper_actions(
  id uuid primary key default gen_random_uuid(),
  helper_guest_id uuid not null references guests(id) on delete cascade,
  trickster_guest_id uuid not null references guests(id) on delete cascade,
  note text not null check(char_length(note) between 1 and 500),
  status text not null default 'RECORDED' check(status in ('RECORDED','CONFIRMED','REJECTED')),
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check(helper_guest_id<>trickster_guest_id)
);
create index if not exists cupid_helper_actions_helper_idx on cupid_helper_actions(helper_guest_id,created_at desc);
alter table cupid_helper_actions enable row level security;
revoke all on cupid_helper_actions from public,anon,authenticated;

create table if not exists assignment_mutual_confirmations(
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references assignments(id) on delete cascade,
  owner_guest_id uuid not null references guests(id) on delete cascade,
  confirmer_guest_id uuid not null references guests(id) on delete cascade,
  status text not null default 'PENDING' check(status in ('PENDING','ACTIVE','REJECTED')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check(owner_guest_id<>confirmer_guest_id)
);
create index if not exists assignment_mutual_confirmer_idx on assignment_mutual_confirmations(confirmer_guest_id,status,created_at desc);
alter table assignment_mutual_confirmations enable row level security;
revoke all on assignment_mutual_confirmations from public,anon,authenticated;

-- Retire the superseded rehearsal catalog without deleting its assignments.
update tasks set active=false,mission_code='LEGACY-20260729-'||mission_code
where mission_code in (
  'P1-001','P1-002','P1-003','P1-004','P1-005','P1-006','P1-007','P1-008',
  'P2-DECOY-001','P2-DECOY-002','P2-DECOY-003','P2-DECOY-004','P2-DECOY-005','P2-TRICKSTER-001'
);

insert into tasks(
  mission_code,title,description,verification_method,points,role_scope,category,stage,
  active,is_demo,story_role_scope,mechanic,score_policy,assignment_mode,verification_type,max_assignments
) values
  ('P1-CER-001','誓词引导人','请在工作人员通知后到达指定位置，引导新人完成誓词。不要提前上台或公开任务。','由主持人确认流程沟通、到位及誓词引导均已完成。',5,'guest','ceremony','task_round_1',true,false,'OFFICIANT','STANDARD','STANDARD','MANUAL','HOST_CONFIRM',1),
  ('P1-CER-002','戒指守护者','请在工作人员通知后领取指定戒指盒，并在交换戒指环节按照提示送到新人身边。','由主持人确认戒指已经安全送达。',3,'guest','ceremony','task_round_1',true,false,'RING_KEEPER','STANDARD','STANDARD','MANUAL','HOST_CONFIRM',2),
  ('P1-CER-003','新郎应援者','在新郎入场或主持人给出提示时说：“新郎今天太帅了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。',3,'guest','ceremony','task_round_1',true,false,'GROOM_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',1),
  ('P1-CER-004','新娘应援者','在新娘入场或主持人给出提示时说：“新娘今天太美了！”不要打断誓词或正式讲话。','由主持人在指定节点后确认。',3,'guest','ceremony','task_round_1',true,false,'BRIDE_CHEERLEADER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',1),
  ('P1-CER-005','掌声发起者','在新人完成誓词、交换戒指、拥抱或主持人宣布仪式完成后的合适节点率先鼓掌。','由主持人现场确认。',3,'guest','ceremony','task_round_1',true,false,'APPLAUSE_STARTER','STANDARD','STANDARD','CONTROLLED_RANDOM','HOST_CONFIRM',2),
  ('P1-HEART-001','寻找爱心伙伴','找到另一位愿意与你组成丘比特联盟的爱心玩家。双方在软件中互相输入玩家编号后完成配对。','双方确认或工作人员确认。',2,'guest','standard','task_round_1',true,false,'HEART_HOLDER','HEART_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',5),
  ('P1-STAR-001','寻找星星伙伴','找到另一位愿意与你组成星光联盟的星星玩家。双方在软件中互相输入玩家编号后完成配对。','双方确认或工作人员确认。',2,'guest','standard','task_round_1',true,false,'STAR_HOLDER','STAR_MATCH','STANDARD','CONTROLLED_RANDOM','MUTUAL_CONFIRM',5),
  ('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','STANDARD','STANDARD','RANDOM','PHOTO',null),
  ('P1-BONUS-001','丘比特幸运星','丘比特今天格外眷顾你。你不需要完成额外任务，打开卡片后立即获得2点个人积分。','系统自动完成。',2,'guest','standard','task_round_1',true,false,'NONE','INSTANT_BONUS','STANDARD','RANDOM','SYSTEM_CONFIRM',3),
  ('P1-DECOY-001','丘比特心情调查','找到三位宾客询问“你觉得丘比特今天心情怎么样？”，提交其中最有趣的一条回答。','提交回答或由工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',null),
  ('P1-DECOY-002','认真工作的丘比特','如果有人问丘比特今天心情怎么样，请回答“他今天好像特别认真。”','成功自然回答一次后由工作人员确认。',2,'guest','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',2),
  ('P1-DECOY-003','休假的丘比特','如果有人询问丘比特的心情、状态或下落，请回答“我觉得他今天想休假。”','成功自然回答一次后由工作人员确认。',2,'guest','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',2),
  ('P1-DECOY-004','丘比特的消息','找到两位宾客问“你收到丘比特的消息了吗？”，然后说“看来消息还没有传到这里。”','说明两位对话对象，由工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',null),
  ('P1-DECOY-005','一点小意外','与两位不同宾客聊天时自然说出“今天好像会发生一点意外。”不要说明这是任务。','说明两位对话对象，由工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',null),
  ('P1-DECOY-006','爱情天气','找到两位宾客询问“你觉得今天的爱情天气怎么样？”，提交最有趣的回答。','提交回答或由工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','DECOY_DIALOGUE','STANDARD','RANDOM','STAFF_CONFIRM',null),
  ('P1-TRICKSTER-001','寻找恶作剧者同伴','使用秘密暗号试探其他宾客。找到正确回答者后，双方互相输入玩家编号建立同伴关系。','恶作剧者双方确认。',0,'spy','hidden','task_round_1',true,false,'NONE','TRICKSTER_SIGNAL','NO_PERSONAL','RANDOM','MUTUAL_CONFIRM',null),
  ('P1-SPECIAL-001','丘比特的帮手','你知道所有恶作剧者的身份。请暗中帮助他们隐藏身份，并为有效帮助留下记录。','最终阶段根据有效帮助记录结算。',0,'helper','hidden','task_round_1',true,false,'NONE','STANDARD','NO_PERSONAL','MANUAL','STAFF_CONFIRM',1)
on conflict(mission_code) do update set
  title=excluded.title,description=excluded.description,verification_method=excluded.verification_method,
  points=excluded.points,role_scope=excluded.role_scope,category=excluded.category,stage=excluded.stage,
  active=true,is_demo=false,story_role_scope=excluded.story_role_scope,mechanic=excluded.mechanic,
  score_policy=excluded.score_policy,assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,max_assignments=excluded.max_assignments;

create or replace function configure_guest_story_role(p_guest_id uuid,p_story_role text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype; v_limit integer; v_used integer;
begin
  if p_story_role not in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER','STAR_HOLDER') then
    raise exception using errcode='22023',message='invalid_story_role';
  end if;
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' then raise exception using errcode='P0001',message='story_role_active_player_required'; end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  v_limit:=case p_story_role when 'RING_KEEPER' then 2 when 'APPLAUSE_STARTER' then 2
    when 'HEART_HOLDER' then 5 when 'STAR_HOLDER' then 5 when 'NONE' then 999 else 1 end;
  if p_story_role<>'NONE' then
    select count(*)::integer into v_used from guests where active and story_role=p_story_role and id<>p_guest_id;
    if v_used>=v_limit then raise exception using errcode='P0001',message='story_role_capacity_full'; end if;
  end if;
  update guests set story_role=p_story_role,ceremony_eligible=p_story_role in ('OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER'),
    eligible_for_secret_role=p_story_role='NONE',hidden_role=case when p_story_role='NONE' then hidden_role else 'NONE' end,
    role=case when p_story_role<>'NONE' then 'guest' else role end,
    role_locked=case when p_story_role<>'NONE' then true else role_locked end
  where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.story_role_configure','guest',p_guest_id::text,jsonb_build_object('previous_story_role',v_guest.story_role,'story_role',p_story_role));
end; $$;

create or replace function configure_guest_hidden_role(p_guest_id uuid,p_hidden_role text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  if p_hidden_role not in ('NONE','CUPID_HELPER') then raise exception using errcode='22023',message='invalid_hidden_role'; end if;
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' or v_guest.story_role<>'NONE' or v_guest.role='spy' then
    raise exception using errcode='P0001',message='hidden_role_conflict';
  end if;
  if p_hidden_role='CUPID_HELPER' and exists(select 1 from guests where active and hidden_role='CUPID_HELPER' and id<>p_guest_id) then
    raise exception using errcode='P0001',message='cupid_helper_already_assigned';
  end if;
  update guests set hidden_role=p_hidden_role,eligible_for_secret_role=p_hidden_role='NONE',role='guest',role_locked=p_hidden_role<>'NONE' where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.hidden_role_configure','guest',p_guest_id::text,jsonb_build_object('previous_hidden_role',v_guest.hidden_role,'hidden_role',p_hidden_role));
end; $$;

alter table assignments add column if not exists cancelled_at timestamptz;
alter table assignments add column if not exists ceremony_status text;
alter table assignments add column if not exists ring_variant text;
alter table assignments add column if not exists replaced_by_assignment_id uuid references assignments(id) on delete set null;
alter table assignments add column if not exists replacement_for_assignment_id uuid references assignments(id) on delete set null;
alter table assignments drop constraint if exists assignments_status_check;
alter table assignments add constraint assignments_status_check
  check(status in ('assigned','submitted','approved','rejected','cancelled'));
alter table assignments drop constraint if exists assignments_ceremony_status_check;
alter table assignments add constraint assignments_ceremony_status_check
  check(ceremony_status is null or ceremony_status in ('LOCKED','AVAILABLE','BRIEFED','RING_RECEIVED','IN_PROGRESS','DELIVERED','COMPLETED'));
alter table assignments drop constraint if exists assignments_ring_variant_check;
alter table assignments add constraint assignments_ring_variant_check
  check(ring_variant is null or ring_variant in ('GROOM_RING','BRIDE_RING'));

update assignments a set ceremony_status=case when a.status='approved' then 'COMPLETED' else 'AVAILABLE' end
from tasks t where t.id=a.task_id and t.category='ceremony' and a.ceremony_status is null;

create or replace function initialize_assignment_ceremony_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if exists(select 1 from tasks where id=new.task_id and category='ceremony') and new.ceremony_status is null then
    new.ceremony_status:='AVAILABLE';
  end if;
  return new;
end; $$;
drop trigger if exists initialize_assignment_ceremony_status on assignments;
create trigger initialize_assignment_ceremony_status before insert on assignments
for each row execute function initialize_assignment_ceremony_status();

create or replace function sync_completed_ceremony_status()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='approved' and new.ceremony_status is not null then new.ceremony_status:='COMPLETED'; end if;
  return new;
end; $$;
drop trigger if exists sync_completed_ceremony_status on assignments;
create trigger sync_completed_ceremony_status before update of status on assignments
for each row execute function sync_completed_ceremony_status();

drop function if exists draw_guest_card(uuid);
create function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public as $$
declare
  v_guest guests%rowtype; v_team text; v_role text; v_task tasks%rowtype;
  v_assignment assignments%rowtype; v_capacity integer; v_registration_open boolean;
  v_hidden_task_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v2'));
  select registration_open into v_registration_open from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' or not v_guest.eligible_for_mission then
    raise exception using errcode='P0001',message='guest_not_mission_eligible';
  end if;
  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a where a.guest_id=v_guest.id and a.is_initial order by a.created_at limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,v_task.description,
      v_task.verification_method,v_task.points,v_guest.drawn_at; return;
  end if;
  if not coalesce(v_registration_open,false) then raise exception using errcode='P0001',message='draw_registration_closed'; end if;

  if v_guest.team_locked then
    v_team:=v_guest.team;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team;
    if v_team not in ('玫瑰组','月桂组','星辰组','琥珀组') or v_capacity>=8 then
      raise exception using errcode='P0001',message='draw_preset_capacity_full';
    end if;
  else
    select available.team_name into v_team from(
      select candidate.team_name,count(g.id) used_slots
      from(values('玫瑰组'),('月桂组'),('星辰组'),('琥珀组')) candidate(team_name)
      left join guests g on g.drawn_at is not null and g.team=candidate.team_name
      group by candidate.team_name having count(g.id)<8
    ) available order by available.used_slots,random() limit 1;
    if v_team is null then raise exception using errcode='P0001',message='draw_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' or v_guest.hidden_role='CUPID_HELPER' or not v_guest.eligible_for_secret_role then
    v_role:='guest';
  elsif v_guest.role_locked then
    v_role:=v_guest.role;
    if v_role not in ('guest','spy') then raise exception using errcode='P0001',message='invalid_final_role'; end if;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team and role=v_role;
    if (v_role='spy' and v_capacity>=1) or (v_role='guest' and v_capacity>=7) then
      raise exception using errcode='P0001',message='draw_preset_role_capacity_full';
    end if;
  else
    select slots.role_name into v_role from(
      select 'spy'::text role_name from generate_series(1,greatest(0,1-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='spy')))
      union all select 'guest'::text from generate_series(1,greatest(0,7-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='guest')))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' then
    select * into v_task from tasks where active and stage='task_round_1' and story_role_scope=v_guest.story_role order by mission_code limit 1;
  elsif v_guest.hidden_role='CUPID_HELPER' or v_role='spy' then
    select * into v_task from tasks t where t.active and t.mission_code in
      ('P1-SOCIAL-001','P1-DECOY-001','P1-DECOY-004','P1-DECOY-005','P1-DECOY-006')
      and (t.max_assignments is null or (select count(*) from assignments a where a.task_id=t.id)<t.max_assignments)
      order by random() limit 1;
  else
    select * into v_task from tasks t where t.active and t.stage='task_round_1' and t.story_role_scope='NONE'
      and t.role_scope in ('all','guest') and t.category<>'hidden'
      and t.mechanic in ('STANDARD','DECOY_DIALOGUE','INSTANT_BONUS')
      and (t.max_assignments is null or (select count(*) from assignments a where a.task_id=t.id)<t.max_assignments)
      order by random() limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  update guests set team=v_team,role=v_role,drawn_at=now() where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;

  if v_guest.story_role in ('HEART_HOLDER','STAR_HOLDER') then
    insert into symbol_pairing_assignments(guest_id,symbol,status)
    values(v_guest.id,case when v_guest.story_role='HEART_HOLDER' then 'HEART' else 'STAR' end,'AVAILABLE')
    on conflict(guest_id) do update set symbol=excluded.symbol,status='AVAILABLE',partner_guest_id=null,pending_relationship_id=null,finalized_at=null,updated_at=now();
  end if;
  if v_role='spy' then
    select id into v_hidden_task_id from tasks where mission_code='P1-TRICKSTER-001' and active;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false) on conflict(guest_id,task_id) do nothing;
  elsif v_guest.hidden_role='CUPID_HELPER' then
    select id into v_hidden_task_id from tasks where mission_code='P1-SPECIAL-001' and active;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false) on conflict(guest_id,task_id) do nothing;
  end if;
  if v_task.mechanic='INSTANT_BONUS' then
    perform complete_system_mission(v_guest.id,'INSTANT_BONUS','system:instant-bonus','丘比特幸运星自动奖励');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,
    jsonb_build_object('team',v_team,'role',v_role,'hidden_role',v_guest.hidden_role,'story_role',v_guest.story_role,
      'assignment_id',v_assignment.id,'mission_code',v_task.mission_code,'task_catalog_mode','phase-one-real'));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end; $$;

create or replace function request_player_connection(p_guest_id uuid,p_target_code text,p_relationship_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_stage text; v_max_attempts integer; v_guest guests%rowtype; v_target guests%rowtype;
  v_a uuid; v_b uuid; v_is_a boolean; v_relation player_relationships%rowtype;
  v_symbol text; v_expected_role text; v_attempts integer; v_mechanic text; v_unlocked text;
begin
  select stage,trickster_max_attempts into v_stage,v_max_attempts from game_state where id=1 for share;
  select * into v_guest from guests where id=p_guest_id and active and drawn_at is not null for update;
  if not found then raise exception using errcode='P0002',message='connection_guest_not_ready'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code)) for update;
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=v_guest.id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if v_guest.id::text<v_target.id::text then v_a:=v_guest.id;v_b:=v_target.id;v_is_a:=true;
  else v_a:=v_target.id;v_b:=v_guest.id;v_is_a:=false; end if;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    if v_stage<>'task_round_1' then raise exception using errcode='P0001',message='symbol_connection_stage_closed'; end if;
    v_symbol:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART' else 'STAR' end;
    v_expected_role:=case when v_symbol='HEART' then 'HEART_HOLDER' else 'STAR_HOLDER' end;
    if v_guest.story_role<>v_expected_role or v_target.story_role<>v_expected_role then
      raise exception using errcode='P0001',message='symbol_holder_required';
    end if;
    if exists(select 1 from symbol_pairing_assignments where guest_id in(v_guest.id,v_target.id) and status in('PAIRED','UNPAIRED_FINAL')) then
      raise exception using errcode='P0001',message='symbol_player_unavailable';
    end if;
    if exists(select 1 from player_relationships r where r.relationship_type=p_relationship_type and r.status='PENDING'
      and (r.player_a_id in(v_guest.id,v_target.id) or r.player_b_id in(v_guest.id,v_target.id))
      and not(r.player_a_id=v_a and r.player_b_id=v_b)) then
      raise exception using errcode='P0001',message='symbol_pending_conflict';
    end if;
  elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if v_stage<>'task_round_1' then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;
    if v_guest.role<>'spy' then raise exception using errcode='28000',message='trickster_connection_forbidden'; end if;
    if not exists(select 1 from trickster_signal_attempts where guest_id=v_guest.id and target_guest_id=v_target.id) then
      select count(*)::integer into v_attempts from trickster_signal_attempts where guest_id=v_guest.id;
      if v_attempts>=v_max_attempts then raise exception using errcode='P0001',message='trickster_attempt_limit'; end if;
      insert into trickster_signal_attempts(guest_id,target_guest_id,matched) values(v_guest.id,v_target.id,v_target.role='spy');
      insert into audit_log(actor,action,target_type,target_id,details)
      values('guest:'||v_guest.id::text,'trickster.signal_attempt','guest',v_guest.id::text,
        jsonb_build_object('target_guest_id',v_target.id,'matched',v_target.role='spy','attempt_limit',v_max_attempts));
    end if;
    if v_target.role<>'spy' then return jsonb_build_object('relationshipType',p_relationship_type,'status','NO_MATCH','maxAttempts',v_max_attempts); end if;
  else
    raise exception using errcode='22023',message='invalid_relationship_type';
  end if;

  insert into player_relationships(relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status)
  values(p_relationship_type,v_a,v_b,v_is_a,not v_is_a,'PENDING')
  on conflict(relationship_type,player_a_id,player_b_id) do update set
    player_a_confirmed=case when player_relationships.status='REJECTED' then excluded.player_a_confirmed else player_relationships.player_a_confirmed or excluded.player_a_confirmed end,
    player_b_confirmed=case when player_relationships.status='REJECTED' then excluded.player_b_confirmed else player_relationships.player_b_confirmed or excluded.player_b_confirmed end,
    status=case when player_relationships.status='REJECTED' then 'PENDING' else player_relationships.status end,
    activated_at=case when player_relationships.status='REJECTED' then null else player_relationships.activated_at end
  returning * into v_relation;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    update symbol_pairing_assignments set status='PENDING',pending_relationship_id=v_relation.id,updated_at=now()
    where guest_id in(v_a,v_b) and status in('AVAILABLE','PENDING');
  end if;
  if v_relation.player_a_confirmed and v_relation.player_b_confirmed and v_relation.status='PENDING' then
    update player_relationships set status='ACTIVE',activated_at=now() where id=v_relation.id returning * into v_relation;
    if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
      v_mechanic:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART_MATCH' else 'STAR_MATCH' end;
      v_unlocked:=case when p_relationship_type='CUPID_ALLIANCE' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
      update symbol_pairing_assignments set status='PAIRED',partner_guest_id=case when guest_id=v_a then v_b else v_a end,
        pending_relationship_id=null,updated_at=now() where guest_id in(v_a,v_b);
      update guests set unlocked_role=v_unlocked where id in(v_a,v_b);
      perform complete_system_mission(v_a,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
      perform complete_system_mission(v_b,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
    else
      perform complete_system_mission(v_a,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
      perform complete_system_mission(v_b,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:relationship','relationship.activate','player_relationship',v_relation.id::text,
      jsonb_build_object('relationship_type',p_relationship_type,'player_a_id',v_a,'player_b_id',v_b));
  end if;
  return jsonb_build_object('relationshipType',p_relationship_type,'status',v_relation.status,'maxAttempts',v_max_attempts);
end; $$;

create or replace function reject_player_connection(p_guest_id uuid,p_relationship_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_relation player_relationships%rowtype;
begin
  select * into v_relation from player_relationships where id=p_relationship_id for update;
  if not found then raise exception using errcode='P0002',message='relationship_not_found'; end if;
  if p_guest_id not in(v_relation.player_a_id,v_relation.player_b_id) then raise exception using errcode='28000',message='relationship_forbidden'; end if;
  if v_relation.status<>'PENDING' or v_relation.relationship_type not in('CUPID_ALLIANCE','STAR_ALLIANCE') then
    raise exception using errcode='P0001',message='relationship_not_rejectable';
  end if;
  update player_relationships set status='REJECTED' where id=v_relation.id;
  update symbol_pairing_assignments set status='AVAILABLE',pending_relationship_id=null,updated_at=now()
  where guest_id in(v_relation.player_a_id,v_relation.player_b_id) and pending_relationship_id=v_relation.id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'relationship.reject','player_relationship',v_relation.id::text,'{}'::jsonb);
end; $$;

create or replace function record_cupid_helper_action(p_helper_guest_id uuid,p_trickster_guest_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if char_length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception using errcode='22023',message='helper_note_invalid'; end if;
  if not exists(select 1 from guests where id=p_helper_guest_id and hidden_role='CUPID_HELPER' and active) then
    raise exception using errcode='28000',message='helper_action_forbidden';
  end if;
  if not exists(select 1 from guests where id=p_trickster_guest_id and role='spy' and active) then
    raise exception using errcode='P0002',message='trickster_not_found';
  end if;
  insert into cupid_helper_actions(helper_guest_id,trickster_guest_id,note) values(p_helper_guest_id,p_trickster_guest_id,trim(p_note)) returning id into v_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_helper_guest_id::text,'helper.action_record','cupid_helper_action',v_id::text,jsonb_build_object('trickster_guest_id',p_trickster_guest_id));
  return v_id;
end; $$;

create or replace function request_assignment_mutual_confirmation(
  p_assignment_id uuid,p_owner_guest_id uuid,p_target_code text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_assignment assignments%rowtype; v_target guests%rowtype; v_id uuid; v_stage text; v_code text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if v_stage<>'task_round_1' then raise exception using errcode='P0001',message='mutual_confirmation_stage_closed'; end if;
  select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and a.guest_id=p_owner_guest_id and a.status in('assigned','rejected') for update of a;
  if not found then raise exception using errcode='P0002',message='mutual_assignment_not_found'; end if;
  select mission_code into v_code from tasks where id=v_assignment.task_id;
  if v_code<>'P1-SOCIAL-001' then raise exception using errcode='P0001',message='mutual_confirmation_not_supported'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code));
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=p_owner_guest_id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if (select count(*) from assignment_mutual_confirmations where confirmer_guest_id=v_target.id and status='ACTIVE')>=2 then
    raise exception using errcode='P0001',message='mutual_confirmer_limit';
  end if;
  insert into assignment_mutual_confirmations(assignment_id,owner_guest_id,confirmer_guest_id,status)
  values(p_assignment_id,p_owner_guest_id,v_target.id,'PENDING')
  on conflict(assignment_id) do update set confirmer_guest_id=excluded.confirmer_guest_id,status='PENDING',responded_at=null,created_at=now()
  where assignment_mutual_confirmations.status='REJECTED'
  returning id into v_id;
  if v_id is null then raise exception using errcode='P0001',message='mutual_confirmation_pending'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_owner_guest_id::text,'assignment.mutual_request','assignment_mutual_confirmation',v_id::text,
    jsonb_build_object('assignment_id',p_assignment_id,'confirmer_guest_id',v_target.id));
  return v_id;
end; $$;

create or replace function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_confirmation assignment_mutual_confirmations%rowtype;
begin
  select * into v_confirmation from assignment_mutual_confirmations where id=p_confirmation_id for update;
  if not found then raise exception using errcode='P0002',message='mutual_confirmation_not_found'; end if;
  if v_confirmation.confirmer_guest_id<>p_confirmer_guest_id then raise exception using errcode='28000',message='mutual_confirmation_forbidden'; end if;
  if v_confirmation.status<>'PENDING' then raise exception using errcode='P0001',message='mutual_confirmation_already_handled'; end if;
  update assignment_mutual_confirmations set status=case when p_accept then 'ACTIVE' else 'REJECTED' end,responded_at=now()
  where id=v_confirmation.id;
  if p_accept then
    update assignments set status='submitted',submitted_at=now(),completion_note='由另一位宾客在软件中确认完成' where id=v_confirmation.assignment_id and status in('assigned','rejected');
    perform approve_assignment(v_confirmation.assignment_id,'system:mutual-confirmation','双方已在软件中确认任务完成');
    update assignments set verification_note='双方已在软件中确认任务完成',verified_by='system:mutual-confirmation',verified_at=now()
    where id=v_confirmation.assignment_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_confirmer_guest_id::text,'assignment.mutual_respond','assignment_mutual_confirmation',v_confirmation.id::text,
    jsonb_build_object('assignment_id',v_confirmation.assignment_id,'accepted',p_accept));
end; $$;

create or replace function undo_player_relationship(p_relationship_id uuid,p_actor text,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_relation player_relationships%rowtype; v_mechanic text; v_guest_id uuid; v_assignment assignments%rowtype; v_points integer;
begin
  if char_length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception using errcode='22023',message='reason_required'; end if;
  select * into v_relation from player_relationships where id=p_relationship_id for update;
  if not found then raise exception using errcode='P0002',message='relationship_not_found'; end if;
  if v_relation.relationship_type not in('CUPID_ALLIANCE','STAR_ALLIANCE') then raise exception using errcode='P0001',message='relationship_not_undoable'; end if;
  if v_relation.status='ACTIVE' then
    v_mechanic:=case when v_relation.relationship_type='CUPID_ALLIANCE' then 'HEART_MATCH' else 'STAR_MATCH' end;
    foreach v_guest_id in array array[v_relation.player_a_id,v_relation.player_b_id] loop
      select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_guest_id and t.mechanic=v_mechanic and a.status='approved' order by a.approved_at desc limit 1 for update of a;
      if found then
        select points into v_points from tasks where id=v_assignment.task_id;
        insert into points_ledger(guest_id,assignment_id,amount,reason,actor) values(v_guest_id,v_assignment.id,-v_points,'撤销误配：'||trim(p_reason),p_actor);
        update guests set points=greatest(0,points-v_points),unlocked_role='NONE' where id=v_guest_id;
        update assignments set status='assigned',approved_at=null,verification_note='',verified_by=null,verified_at=null where id=v_assignment.id;
      end if;
    end loop;
  end if;
  update player_relationships set status='REJECTED' where id=v_relation.id;
  update symbol_pairing_assignments set status='AVAILABLE',partner_guest_id=null,pending_relationship_id=null,updated_at=now()
  where guest_id in(v_relation.player_a_id,v_relation.player_b_id);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'relationship.admin_undo','player_relationship',v_relation.id::text,jsonb_build_object('reason',trim(p_reason),'previous_status',v_relation.status));
end; $$;

create or replace function finalize_phase_one_content(p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_symbol text; v_total integer; v_paired integer; v_pending integer; v_last uuid; v_mechanic text; v_unlocked text; v_cancelled integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-one-finalize-v1'));
  if (select stage from game_state where id=1 for update)<>'task_round_1' then
    raise exception using errcode='P0001',message='phase_one_not_active';
  end if;
  foreach v_symbol in array array['HEART','STAR'] loop
    select count(*)::integer,count(*) filter(where status='PAIRED')::integer,count(*) filter(where status='PENDING')::integer
      into v_total,v_paired,v_pending from symbol_pairing_assignments where symbol=v_symbol;
    if v_total<>5 then raise exception using errcode='P0001',message='symbol_pairing_count_invalid'; end if;
    if v_paired<>4 or v_pending<>0 then raise exception using errcode='P0001',message='symbol_pairing_incomplete'; end if;
    select guest_id into v_last from symbol_pairing_assignments where symbol=v_symbol and status='AVAILABLE' for update;
    if not found then raise exception using errcode='P0001',message='symbol_final_player_missing'; end if;
    v_mechanic:=case when v_symbol='HEART' then 'HEART_MATCH' else 'STAR_MATCH' end;
    v_unlocked:=case when v_symbol='HEART' then 'LONELY_CUPID' else 'GUIDING_STAR' end;
    update symbol_pairing_assignments set status='UNPAIRED_FINAL',finalized_at=now(),updated_at=now() where guest_id=v_last;
    update guests set unlocked_role=v_unlocked where id=v_last;
    perform complete_system_mission(v_last,v_mechanic,'system:phase-one-finalize','阶段结束：最后一位图案玩家自动完成任务');
  end loop;
  update assignments a set status='cancelled',cancelled_at=now(),rejection_reason=null
  from tasks t where t.id=a.task_id and t.stage='task_round_1' and t.category<>'ceremony'
    and a.status in('assigned','submitted','rejected');
  get diagnostics v_cancelled=row_count;
  update game_state set phase_one_completed_at=now(),updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_one.finalize','game_state','1',jsonb_build_object('cancelled_assignments',v_cancelled));
  return jsonb_build_object('cancelledAssignments',v_cancelled,'heartFinalized',true,'starFinalized',true);
end; $$;

create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
begin
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'mission.phase_two_unlock','game_state','1',jsonb_build_object('assignments_created',0,'catalog_pending',true));
  return 0;
end; $$;

create or replace function set_game_stage(p_stage text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype; v_phase_two_count integer:=0; v_phase_one_result jsonb;
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then raise exception using errcode='P0001',message='use_voting_controls'; end if;
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.stage='task_round_1' and p_stage='task_round_2' and v_state.phase_one_completed_at is null then
    v_phase_one_result:=finalize_phase_one_content(p_actor);
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  elsif p_stage='task_round_2' and v_state.stage not in ('task_round_2','group_game','voting','results') then
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;
  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object('previous_stage',v_state.stage,'stage',p_stage,
    'phase_one_result',v_phase_one_result,'phase_two_assignments_created',v_phase_two_count));
end; $$;

create or replace function approve_assignment(p_assignment_id uuid,p_actor text,p_reason text default 'Mission approved')
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_assignment assignments%rowtype; v_task_points integer; v_points integer; v_task_stage text; v_score_policy text;
  v_grants_hidden_spy boolean; v_total integer; v_rank integer; v_role text; v_team text; v_eligible boolean;
  v_upgrade_limit integer; v_clue_limit integer; v_reward_task_id uuid; v_reward_assignment_id uuid; v_reward_clue_id uuid; v_game_stage text;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='reason_required'; end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1')); end if;
  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;
  select points,grants_hidden_spy,stage,score_policy into v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy from tasks where id=v_assignment.task_id;
  select points,role,team,eligible_for_secret_role into v_total,v_role,v_team,v_eligible from guests where id=v_assignment.guest_id for update;
  select stage into v_game_stage from game_state where id=1;
  v_points:=case when v_score_policy='NO_PERSONAL' or (v_task_stage='task_round_1' and v_role='spy') then 0 else v_task_points end;
  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_role<>'guest' then raise exception using errcode='P0001',message='hidden_spy_guest_ineligible'; end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then raise exception using errcode='P0001',message='hidden_spy_already_activated'; end if;
  end if;
  if v_points<>0 then insert into points_ledger(guest_id,assignment_id,amount,reason,actor) values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor); end if;
  update guests set points=points+v_points,role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end where id=v_assignment.guest_id
    returning points,role,team,eligible_for_secret_role into v_total,v_role,v_team,v_eligible;
  update assignments set status='approved',approved_at=now() where id=v_assignment.id;
  if v_assignment.is_initial then
    select count(*)::integer into v_rank from assignments where is_initial and status='approved';
    update assignments set completion_rank=v_rank where id=v_assignment.id;
  end if;
  -- Ranked upgrades and clue rewards intentionally start after phase one.
  if v_assignment.is_initial and v_game_stage<>'task_round_1' then
    select upgrade_reward_limit,clue_reward_limit into v_upgrade_limit,v_clue_limit from game_state where id=1;
    if v_role<>'spy' and v_rank<=v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t where t.active and t.category='upgrade' and t.stage='task_round_2'
        and t.role_scope in('all',v_role) and not exists(select 1 from assignments a where a.guest_id=v_assignment.guest_id and a.task_id=t.id)
        order by random() limit 1;
      if v_reward_task_id is not null then insert into assignments(guest_id,task_id) values(v_assignment.guest_id,v_reward_task_id) returning id into v_reward_assignment_id;
        update assignments set reward_task_id=v_reward_task_id where id=v_assignment.id; end if;
    end if;
    if v_rank<=v_clue_limit and v_eligible and v_role<>'spy' then
      select c.id into v_reward_clue_id from clues c where c.active and not exists(select 1 from guest_clues gc where gc.guest_id=v_assignment.guest_id and gc.clue_id=c.id)
        and(c.spy_guest_id is null or exists(select 1 from guests spy where spy.id=c.spy_guest_id and spy.team=v_team and spy.role='spy'))
        order by case when c.spy_guest_id is not null then 0 else 1 end,c.level,random() limit 1;
      if v_reward_clue_id is not null then insert into guest_clues(guest_id,clue_id,granted_by) values(v_assignment.guest_id,v_reward_clue_id,p_actor);
        update assignments set reward_clue_id=v_reward_clue_id where id=v_assignment.id; end if;
    end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,jsonb_build_object('guest_id',v_assignment.guest_id,
    'task_points',v_task_points,'points_awarded',v_points,'reason',trim(p_reason),'completion_rank',v_rank,
    'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,'phase_one_reward_suppressed',v_game_stage='task_round_1'));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,'hidden_spy_activated',v_grants_hidden_spy);
end; $$;

create or replace function approve_assignment_with_verification(p_assignment_id uuid,p_actor text,p_verification_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_game_stage text;
begin
  if nullif(trim(p_verification_note),'') is null or length(trim(p_verification_note))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;
  select stage into v_game_stage from game_state where id=1;
  v_result:=approve_assignment(p_assignment_id,p_actor,trim(p_verification_note));
  update assignments set verification_note=trim(p_verification_note),verified_by=p_actor,verified_at=now() where id=p_assignment_id;
  return v_result||jsonb_build_object('early_bonus_points',0,'phase_one_reward_suppressed',v_game_stage='task_round_1');
end; $$;

create or replace function update_ceremony_assignment(
  p_assignment_id uuid,p_ceremony_status text,p_ring_variant text,p_actor text
) returns void language plpgsql security definer set search_path=public as $$
declare v_assignment assignments%rowtype; v_code text;
begin
  if p_ceremony_status not in ('LOCKED','AVAILABLE','BRIEFED','RING_RECEIVED','IN_PROGRESS','DELIVERED','COMPLETED') then
    raise exception using errcode='22023',message='invalid_ceremony_status';
  end if;
  if p_ring_variant is not null and p_ring_variant not in ('GROOM_RING','BRIDE_RING') then
    raise exception using errcode='22023',message='invalid_ring_variant';
  end if;
  select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and t.category='ceremony' for update of a;
  if not found then raise exception using errcode='P0002',message='ceremony_assignment_not_found'; end if;
  select mission_code into v_code from tasks where id=v_assignment.task_id;
  if v_code='P1-CER-002' and p_ring_variant is null then raise exception using errcode='P0001',message='ring_variant_required'; end if;
  if v_code<>'P1-CER-002' and p_ring_variant is not null then raise exception using errcode='P0001',message='ring_variant_not_allowed'; end if;
  update assignments set ceremony_status=p_ceremony_status,ring_variant=p_ring_variant where id=p_assignment_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.ceremony_status','assignment',p_assignment_id::text,
    jsonb_build_object('previous_status',v_assignment.ceremony_status,'ceremony_status',p_ceremony_status,
      'previous_ring_variant',v_assignment.ring_variant,'ring_variant',p_ring_variant));
end; $$;

create or replace function reassign_task_assignment(
  p_assignment_id uuid,p_task_id uuid,p_actor text,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_old assignments%rowtype; v_new_id uuid;
begin
  if char_length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception using errcode='22023',message='reason_required'; end if;
  select * into v_old from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_old.status='approved' then raise exception using errcode='P0001',message='assignment_already_completed'; end if;
  if not exists(select 1 from tasks where id=p_task_id and active) then raise exception using errcode='P0002',message='task_not_found'; end if;
  if exists(select 1 from assignments where guest_id=v_old.guest_id and task_id=p_task_id and status<>'cancelled') then
    raise exception using errcode='23505',message='task_already_assigned';
  end if;
  insert into assignments(guest_id,task_id,is_initial,replacement_for_assignment_id)
  values(v_old.guest_id,p_task_id,v_old.is_initial,v_old.id) returning id into v_new_id;
  update assignments set status='cancelled',cancelled_at=now(),is_initial=false,replaced_by_assignment_id=v_new_id where id=v_old.id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.reassign','assignment',v_new_id::text,jsonb_build_object('previous_assignment_id',v_old.id,
    'guest_id',v_old.guest_id,'previous_task_id',v_old.task_id,'task_id',p_task_id,'reason',trim(p_reason)));
  return v_new_id;
end; $$;

create or replace function reset_final_mission_story_runtime()
returns trigger language plpgsql set search_path=public as $$
begin
  delete from cupid_helper_actions;
  delete from assignment_mutual_confirmations;
  delete from symbol_pairing_assignments;
  delete from player_relationships;
  delete from trickster_signal_attempts;
  update heart_slots set guest_id=null,assigned_at=null;
  update guests set unlocked_role='NONE';
  update game_state set phase_one_completed_at=null;
  return new;
end; $$;

create or replace function save_game_task(
  p_task_id uuid,p_title text,p_description text,p_verification_method text,p_points integer,
  p_role_scope text,p_category text,p_stage text,p_active boolean,p_grants_hidden_spy boolean,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing tasks%rowtype;
begin
  if nullif(trim(p_title),'') is null or length(trim(p_title))>120
    or nullif(trim(p_description),'') is null or length(trim(p_description))>1000
    or nullif(trim(p_verification_method),'') is null or length(trim(p_verification_method))>500 then
    raise exception using errcode='22023',message='task_content_required';
  end if;
  if p_points<0 or p_points>12 then raise exception using errcode='22023',message='invalid_task_points'; end if;
  if p_role_scope not in ('all','guest','spy','helper') then raise exception using errcode='22023',message='invalid_role'; end if;
  if p_category not in ('standard','ceremony','group','upgrade','hidden') then raise exception using errcode='22023',message='invalid_task_category'; end if;
  if p_stage not in ('task_round_1','task_round_2','group_game') then raise exception using errcode='22023',message='invalid_game_stage'; end if;
  if p_grants_hidden_spy and (p_category<>'hidden' or p_role_scope<>'guest' or p_stage<>'task_round_2') then
    raise exception using errcode='22023',message='invalid_hidden_spy_task';
  end if;
  if p_grants_hidden_spy and p_active then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-task-v1'));
    if exists(select 1 from tasks where grants_hidden_spy and active and id is distinct from p_task_id) then
      raise exception using errcode='P0001',message='active_hidden_spy_task_exists';
    end if;
  end if;
  if p_task_id is null then
    insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,grants_hidden_spy)
    values(trim(p_title),trim(p_description),trim(p_verification_method),p_points,p_role_scope,p_category,p_stage,p_active,p_grants_hidden_spy)
    returning id into v_id;
  else
    select * into v_existing from tasks where id=p_task_id for update;
    if not found then raise exception using errcode='P0002',message='task_not_found'; end if;
    if exists(select 1 from assignments where task_id=p_task_id) and (
      v_existing.points is distinct from p_points or v_existing.role_scope is distinct from p_role_scope
      or v_existing.category is distinct from p_category or v_existing.stage is distinct from p_stage
      or v_existing.grants_hidden_spy is distinct from p_grants_hidden_spy
    ) then raise exception using errcode='P0001',message='task_rules_locked'; end if;
    update tasks set title=trim(p_title),description=trim(p_description),verification_method=trim(p_verification_method),
      points=p_points,role_scope=p_role_scope,category=p_category,stage=p_stage,active=p_active,grants_hidden_spy=p_grants_hidden_spy
    where id=p_task_id returning id into v_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'task.save','task',v_id::text,jsonb_build_object('title',trim(p_title),'points',p_points,
    'role_scope',p_role_scope,'category',p_category,'stage',p_stage,'active',p_active,'grants_hidden_spy',p_grants_hidden_spy));
  return v_id;
end; $$;

revoke all on function configure_guest_hidden_role(uuid,text,text) from public,anon,authenticated;
revoke all on function request_player_connection(uuid,text,text) from public,anon,authenticated;
revoke all on function reject_player_connection(uuid,uuid) from public,anon,authenticated;
revoke all on function record_cupid_helper_action(uuid,uuid,text) from public,anon,authenticated;
revoke all on function undo_player_relationship(uuid,text,text) from public,anon,authenticated;
revoke all on function finalize_phase_one_content(text) from public,anon,authenticated;
revoke all on function request_assignment_mutual_confirmation(uuid,uuid,text) from public,anon,authenticated;
revoke all on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function update_ceremony_assignment(uuid,text,text,text) from public,anon,authenticated;
revoke all on function reassign_task_assignment(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function configure_guest_hidden_role(uuid,text,text) to service_role;
grant execute on function request_player_connection(uuid,text,text) to service_role;
grant execute on function reject_player_connection(uuid,uuid) to service_role;
grant execute on function record_cupid_helper_action(uuid,uuid,text) to service_role;
grant execute on function undo_player_relationship(uuid,text,text) to service_role;
grant execute on function finalize_phase_one_content(text) to service_role;
grant execute on function request_assignment_mutual_confirmation(uuid,uuid,text) to service_role;
grant execute on function respond_assignment_mutual_confirmation(uuid,uuid,boolean) to service_role;
grant execute on function update_ceremony_assignment(uuid,text,text,text) to service_role;
grant execute on function reassign_task_assignment(uuid,uuid,text,text) to service_role;
grant execute on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607300001','phase_one.real_missions_install','game_state','1',jsonb_build_object(
  'mission_templates',17,'free_heart_players',5,'free_star_players',5,'trickster_default_attempts',5,'family_app_flow_preserved',true));

commit;
