-- Implement the confirmed three-act mission story without deleting historical
-- tasks or assignments. Old draft missions are deactivated, while completed
-- rehearsal records remain readable.
begin;

alter table tasks add column if not exists mission_code text;
alter table tasks add column if not exists mechanic text not null default 'STANDARD';
alter table tasks add column if not exists score_policy text not null default 'STANDARD';
alter table guests add column if not exists player_code text;
alter table guests add column if not exists unlocked_role text not null default 'NONE';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='tasks_mechanic_check') then
    alter table tasks add constraint tasks_mechanic_check
      check(mechanic in ('STANDARD','HEART_MATCH','TRICKSTER_SIGNAL','DECOY_DIALOGUE'));
  end if;
  if not exists(select 1 from pg_constraint where conname='tasks_score_policy_check') then
    alter table tasks add constraint tasks_score_policy_check
      check(score_policy in ('STANDARD','NO_PERSONAL'));
  end if;
  if not exists(select 1 from pg_constraint where conname='guests_unlocked_role_check') then
    alter table guests add constraint guests_unlocked_role_check
      check(unlocked_role in ('NONE','CUPID_ALLIANCE','LONELY_CUPID'));
  end if;
end $$;

create unique index if not exists tasks_mission_code_unique
  on tasks(mission_code);

create sequence if not exists guest_player_code_seq start with 1001;
with ranked as(
  select id,row_number() over(order by active desc,name,id) as position
  from guests where player_code is null
)
update guests g set player_code='P'||lpad(r.position::text,3,'0')
from ranked r where r.id=g.id;
alter table guests alter column player_code set default
  ('P'||lpad(nextval('guest_player_code_seq')::text,4,'0'));
alter table guests alter column player_code set not null;
create unique index if not exists guests_player_code_unique on guests(player_code);

-- Attach stable codes to the two ceremony missions already in production.
update tasks set mission_code='P1-001',mechanic='STANDARD',score_policy='STANDARD'
where story_role_scope='OFFICIANT' and mission_code is null;
update tasks set mission_code='P1-002',mechanic='STANDARD',score_policy='STANDARD'
where story_role_scope='RING_KEEPER' and mission_code is null;

insert into tasks(
  mission_code,title,description,verification_method,points,role_scope,category,stage,
  active,is_demo,story_role_scope,mechanic,score_policy
)
values
  ('P1-001','誓词引导人','你被选为今天的誓词引导人。请暂时保守这个秘密。工作人员会在仪式开始前与你确认流程；在指定环节，请引导新人完成誓词。','由主持人或主办方在仪式结束后确认。',1,'guest','ceremony','task_round_1',true,false,'OFFICIANT','STANDARD','STANDARD'),
  ('P1-002','戒指守护者','丘比特将一项重要使命交给了你。请在工作人员提示后领取戒指盒，并在交换戒指环节将它送到新人身边。在此之前，请不要公开你的任务。','由主持人或主办方在交换戒指环节后确认。',1,'guest','ceremony','task_round_1',true,false,'RING_KEEPER','STANDARD','STANDARD'),
  ('P1-003','新郎应援者','当新郎正式出现，或主持人询问大家对新郎的评价时，请在合适的时机说：“新郎今天太帅了！”请等待合适节点，不要提前暴露任务。','由主持人或主办方在指定节点后确认。',1,'guest','ceremony','task_round_1',true,false,'GROOM_CHEERLEADER','STANDARD','STANDARD'),
  ('P1-004','新娘应援者','当新娘正式出现，或主持人询问大家对新娘的评价时，请在合适的时机说：“新娘今天太美了！”请等待合适节点，不要提前暴露任务。','由主持人或主办方在指定节点后确认。',1,'guest','ceremony','task_round_1',true,false,'BRIDE_CHEERLEADER','STANDARD','STANDARD'),
  ('P1-005','掌声发起者','在新人完成誓词、拥抱，或主持人宣布仪式完成后，请第一时间鼓掌，并自然带动周围宾客一起祝福新人。','由主持人或主办方现场确认。',1,'guest','ceremony','task_round_1',true,false,'APPLAUSE_STARTER','STANDARD','STANDARD'),
  ('P1-006','寻找爱心另一半','你的卡片上有半颗爱心。请通过交流和试探寻找完全匹配的另一半；只有认为彼此匹配时，才交换页面上的玩家编号并由双方确认。','双方在手机中互相输入玩家编号；匹配正确且双向确认后由系统完成。',1,'guest','standard','task_round_1',true,false,'HEART_HOLDER','HEART_MATCH','STANDARD'),
  ('P1-007','第一次见面','找到一位今天第一次见面的宾客。互相介绍自己的名字以及与新人的关系，随后拍一张合影，或一起前往任务站确认。','出示合影，或由双方在任务站共同确认。',1,'guest','standard','task_round_1',true,false,'NONE','STANDARD','STANDARD'),
  ('P1-008','新郎方与新娘方会师','找到一位来自新人另一方朋友圈或家庭的宾客。互相介绍自己与新人的关系，并完成一次合影或任务站确认。','出示合影，或由双方在任务站共同确认。',1,'guest','standard','task_round_1',true,false,'NONE','STANDARD','STANDARD'),
  ('P2-DECOY-001','丘比特采访员','找到三位宾客并询问：“你觉得丘比特今天忙不忙？”记住三个不同答案，再向任务站复述。','向任务站复述三位宾客的不同回答。',1,'guest','standard','task_round_2',true,false,'NONE','DECOY_DIALOGUE','STANDARD'),
  ('P2-DECOY-002','爱情天气','找到两位宾客并询问：“你觉得今天的爱情天气怎么样？”将最有趣的回答告诉任务站。','向任务站复述两位宾客的回答。',1,'guest','standard','task_round_2',true,false,'NONE','DECOY_DIALOGUE','STANDARD'),
  ('P2-DECOY-003','丘比特回答者','如果有人向你询问丘比特的心情，请回答：“我觉得他今天特别认真。”完成一次自然回应即可。','说明发生对话的对象与大致时间，由任务站确认。',1,'guest','standard','task_round_2',true,false,'NONE','DECOY_DIALOGUE','STANDARD'),
  ('P2-DECOY-004','神秘问候','找到两位宾客并询问：“你收到丘比特的消息了吗？”无论对方如何回答，都说：“看来消息还没有传到这里。”','向任务站说明两位对话对象。',1,'guest','standard','task_round_2',true,false,'NONE','DECOY_DIALOGUE','STANDARD'),
  ('P2-DECOY-005','可疑台词','在与两位不同宾客聊天时，自然说出：“今天好像会发生一点意外。”不要解释这句话来自任务。','向任务站说明两位对话对象。',1,'guest','standard','task_round_2',true,false,'NONE','DECOY_DIALOGUE','STANDARD'),
  ('P2-TRICKSTER-001','丘比特的召集令','使用暗号问句“你觉得丘比特今天心情怎么样？”试探最多三位宾客。真正的同伴会回答：“他好像想开个玩笑。”找到同伴后，交换玩家编号并在系统中双向确认。','两位恶作剧者互相输入玩家编号，系统双向确认。',1,'spy','standard','task_round_2',true,false,'NONE','TRICKSTER_SIGNAL','NO_PERSONAL')
on conflict(mission_code) do update set
  title=excluded.title,description=excluded.description,
  verification_method=excluded.verification_method,points=excluded.points,
  role_scope=excluded.role_scope,category=excluded.category,stage=excluded.stage,
  active=true,is_demo=false,story_role_scope=excluded.story_role_scope,
  mechanic=excluded.mechanic,score_policy=excluded.score_policy;

-- The final design explicitly removed all earlier phase-one draft missions.
update tasks set active=false
where is_demo=false and stage='task_round_1' and mission_code is null;
update game_state set task_catalog_mode='live',updated_at=now() where id=1;

create table if not exists heart_slots(
  heart_code text primary key,
  pair_key text not null check(pair_key in ('A','B','SOLO')),
  side text not null check(side in ('LEFT','RIGHT','SOLO')),
  guest_id uuid unique references guests(id) on delete set null,
  assigned_at timestamptz,
  check((pair_key='SOLO')=(side='SOLO'))
);

insert into heart_slots(heart_code,pair_key,side) values
  ('HEART-A-L','A','LEFT'),('HEART-A-R','A','RIGHT'),
  ('HEART-B-L','B','LEFT'),('HEART-B-R','B','RIGHT'),
  ('HEART-SOLO','SOLO','SOLO')
on conflict(heart_code) do update set pair_key=excluded.pair_key,side=excluded.side;

create table if not exists player_relationships(
  id uuid primary key default gen_random_uuid(),
  relationship_type text not null check(relationship_type in ('CUPID_ALLIANCE','TRICKSTER_CONNECTION')),
  player_a_id uuid not null references guests(id) on delete cascade,
  player_b_id uuid not null references guests(id) on delete cascade,
  player_a_confirmed boolean not null default false,
  player_b_confirmed boolean not null default false,
  status text not null default 'PENDING' check(status in ('PENDING','ACTIVE','REVEALED')),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  check(player_a_id<>player_b_id),
  unique(relationship_type,player_a_id,player_b_id)
);

create table if not exists trickster_signal_attempts(
  id bigint generated always as identity primary key,
  guest_id uuid not null references guests(id) on delete cascade,
  target_guest_id uuid not null references guests(id) on delete cascade,
  matched boolean not null,
  created_at timestamptz not null default now(),
  unique(guest_id,target_guest_id),
  check(guest_id<>target_guest_id)
);

create table if not exists alliance_clue_fragments(
  pair_key text primary key check(pair_key in ('A','B')),
  title text not null default '丘比特联盟共享线索' check(char_length(title) between 1 and 120),
  left_fragment text not null default '' check(char_length(left_fragment)<=500),
  right_fragment text not null default '' check(char_length(right_fragment)<=500),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into alliance_clue_fragments(pair_key) values('A'),('B') on conflict(pair_key) do nothing;

alter table heart_slots enable row level security;
alter table player_relationships enable row level security;
alter table trickster_signal_attempts enable row level security;
alter table alliance_clue_fragments enable row level security;
revoke all on heart_slots,player_relationships,trickster_signal_attempts,alliance_clue_fragments
  from public,anon,authenticated;

create or replace function complete_system_mission(
  p_guest_id uuid,p_mechanic text,p_actor text,p_note text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_assignment assignments%rowtype; v_points integer; v_score_policy text; v_eligible boolean;
begin
  select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
  where a.guest_id=p_guest_id and t.mechanic=p_mechanic and a.status<>'approved'
  order by a.created_at limit 1 for update of a;
  if not found then return null; end if;
  select points,score_policy into v_points,v_score_policy from tasks where id=v_assignment.task_id;
  select eligible_for_personal_score into v_eligible from guests where id=p_guest_id for update;
  if v_score_policy='STANDARD' and v_eligible then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(p_guest_id,v_assignment.id,v_points,p_note,p_actor);
    update guests set points=points+v_points where id=p_guest_id;
  end if;
  update assignments set status='approved',submitted_at=coalesce(submitted_at,now()),approved_at=now(),
    verification_note=p_note,verified_by=p_actor,verified_at=now(),rejection_reason=null
  where id=v_assignment.id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.system_complete','assignment',v_assignment.id::text,
    jsonb_build_object('guest_id',p_guest_id,'mechanic',p_mechanic,
      'points_awarded',case when v_score_policy='STANDARD' and v_eligible then v_points else 0 end));
  return v_assignment.id;
end;
$$;

create or replace function request_player_connection(
  p_guest_id uuid,p_target_code text,p_relationship_type text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_stage text; v_guest guests%rowtype; v_target guests%rowtype;
  v_guest_heart heart_slots%rowtype; v_target_heart heart_slots%rowtype;
  v_a uuid; v_b uuid; v_relation player_relationships%rowtype;
  v_attempts integer; v_is_a boolean; v_status text;
begin
  select stage into v_stage from game_state where id=1 for share;
  select * into v_guest from guests where id=p_guest_id and active and drawn_at is not null for update;
  if not found then raise exception using errcode='P0002',message='connection_guest_not_ready'; end if;
  select * into v_target from guests
  where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code));
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=v_guest.id then raise exception using errcode='22023',message='connection_self_target'; end if;

  if v_guest.id::text<v_target.id::text then v_a:=v_guest.id;v_b:=v_target.id;v_is_a:=true;
  else v_a:=v_target.id;v_b:=v_guest.id;v_is_a:=false; end if;

  if p_relationship_type='CUPID_ALLIANCE' then
    if v_stage not in ('task_round_1','task_round_2','group_game') then
      raise exception using errcode='P0001',message='heart_connection_stage_closed';
    end if;
    if v_guest.story_role<>'HEART_HOLDER' or v_target.story_role<>'HEART_HOLDER' then
      raise exception using errcode='P0001',message='heart_holder_required';
    end if;
    select * into v_guest_heart from heart_slots where guest_id=v_guest.id;
    select * into v_target_heart from heart_slots where guest_id=v_target.id;
    if v_guest_heart.pair_key='SOLO' or v_target_heart.pair_key='SOLO'
      or v_guest_heart.pair_key<>v_target_heart.pair_key
      or v_guest_heart.side=v_target_heart.side then
      raise exception using errcode='P0001',message='heart_pair_not_matched';
    end if;
  elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if v_stage not in ('task_round_2','group_game') then
      raise exception using errcode='P0001',message='trickster_connection_stage_closed';
    end if;
    if v_guest.role<>'spy' then raise exception using errcode='28000',message='trickster_connection_forbidden'; end if;
    if not exists(select 1 from trickster_signal_attempts where guest_id=v_guest.id and target_guest_id=v_target.id) then
      select count(*)::integer into v_attempts from trickster_signal_attempts where guest_id=v_guest.id;
      if v_attempts>=3 then raise exception using errcode='P0001',message='trickster_attempt_limit'; end if;
      insert into trickster_signal_attempts(guest_id,target_guest_id,matched)
      values(v_guest.id,v_target.id,v_target.role='spy');
      insert into audit_log(actor,action,target_type,target_id,details)
      values('guest:'||v_guest.id::text,'trickster.signal_attempt','guest',v_guest.id::text,
        jsonb_build_object('target_guest_id',v_target.id,'matched',v_target.role='spy'));
    end if;
    if v_target.role<>'spy' then
      return jsonb_build_object('relationshipType',p_relationship_type,'status','NO_MATCH');
    end if;
  else
    raise exception using errcode='22023',message='invalid_relationship_type';
  end if;

  insert into player_relationships(
    relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed
  ) values(p_relationship_type,v_a,v_b,v_is_a,not v_is_a)
  on conflict(relationship_type,player_a_id,player_b_id) do update set
    player_a_confirmed=player_relationships.player_a_confirmed or excluded.player_a_confirmed,
    player_b_confirmed=player_relationships.player_b_confirmed or excluded.player_b_confirmed
  returning * into v_relation;

  if v_relation.player_a_confirmed and v_relation.player_b_confirmed and v_relation.status='PENDING' then
    update player_relationships set status='ACTIVE',activated_at=now()
    where id=v_relation.id returning * into v_relation;
    if p_relationship_type='CUPID_ALLIANCE' then
      update guests set unlocked_role='CUPID_ALLIANCE' where id in(v_a,v_b);
      perform complete_system_mission(v_a,'HEART_MATCH','system:heart-match','爱心编号匹配，双方已确认');
      perform complete_system_mission(v_b,'HEART_MATCH','system:heart-match','爱心编号匹配，双方已确认');
    else
      perform complete_system_mission(v_a,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
      perform complete_system_mission(v_b,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:relationship','relationship.activate','player_relationship',v_relation.id::text,
      jsonb_build_object('relationship_type',p_relationship_type,'player_a_id',v_a,'player_b_id',v_b));
  end if;
  v_status:=v_relation.status;
  return jsonb_build_object('relationshipType',p_relationship_type,'status',v_status);
end;
$$;

create or replace function unlock_phase_two_missions(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_guest guests%rowtype; v_task_id uuid; v_count integer:=0;
begin
  for v_guest in select * from guests
    where active and participation_mode='ACTIVE_PLAYER' and eligible_for_mission and drawn_at is not null
    order by id for update
  loop
    if exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_guest.id and t.mission_code like 'P2-%') then continue; end if;
    if v_guest.role='spy' then
      select id into v_task_id from tasks where mission_code='P2-TRICKSTER-001' and active;
    else
      select id into v_task_id from tasks
      where active and mechanic='DECOY_DIALOGUE' and mission_code like 'P2-DECOY-%'
      order by random() limit 1;
    end if;
    if v_task_id is null then raise exception using errcode='P0001',message='phase_two_task_missing'; end if;
    insert into assignments(guest_id,task_id) values(v_guest.id,v_task_id);
    v_count:=v_count+1;
  end loop;
  update guests g set unlocked_role='LONELY_CUPID'
  where g.story_role='HEART_HOLDER' and exists(
    select 1 from heart_slots h where h.guest_id=g.id and h.side='SOLO'
  ) and g.unlocked_role='NONE';
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'mission.phase_two_unlock','game_state','1',jsonb_build_object('assignments_created',v_count));
  return v_count;
end;
$$;

create or replace function set_game_stage(p_stage text,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_state game_state%rowtype; v_phase_two_count integer:=0;
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then raise exception using errcode='P0001',message='use_voting_controls'; end if;
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if p_stage='task_round_2' and v_state.stage not in ('task_round_2','group_game','voting','results') then
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;
  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object(
    'previous_stage',v_state.stage,'stage',p_stage,'public_display_cleared',true,
    'phase_two_assignments_created',v_phase_two_count));
end;
$$;

create or replace function configure_guest_story_role(
  p_guest_id uuid,p_story_role text,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_guest guests%rowtype; v_limit integer; v_used integer;
begin
  if p_story_role not in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER') then
    raise exception using errcode='22023',message='invalid_story_role';
  end if;
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' then
    raise exception using errcode='P0001',message='story_role_active_player_required';
  end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  v_limit:=case p_story_role when 'RING_KEEPER' then 2 when 'APPLAUSE_STARTER' then 2
    when 'HEART_HOLDER' then 5 when 'NONE' then 999 else 1 end;
  if p_story_role<>'NONE' then
    select count(*)::integer into v_used from guests
    where active and story_role=p_story_role and id<>p_guest_id;
    if v_used>=v_limit then raise exception using errcode='P0001',message='story_role_capacity_full'; end if;
  end if;
  update guests set story_role=p_story_role,ceremony_eligible=p_story_role<>'NONE',
    eligible_for_secret_role=p_story_role='NONE',
    role=case when p_story_role<>'NONE' then 'guest' else role end,
    role_locked=case when p_story_role<>'NONE' then true else role_locked end
  where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.story_role_configure','guest',p_guest_id::text,
    jsonb_build_object('previous_story_role',v_guest.story_role,'story_role',p_story_role));
end;
$$;

create or replace function save_alliance_clue_fragment(
  p_pair_key text,p_title text,p_left_fragment text,p_right_fragment text,p_active boolean,p_actor text
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_pair_key not in ('A','B') then raise exception using errcode='22023',message='invalid_alliance_pair'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 120
    or char_length(coalesce(p_left_fragment,''))>500 or char_length(coalesce(p_right_fragment,''))>500 then
    raise exception using errcode='22023',message='invalid_alliance_clue';
  end if;
  insert into alliance_clue_fragments(pair_key,title,left_fragment,right_fragment,active,updated_at)
  values(p_pair_key,trim(p_title),trim(p_left_fragment),trim(p_right_fragment),p_active,now())
  on conflict(pair_key) do update set title=excluded.title,left_fragment=excluded.left_fragment,
    right_fragment=excluded.right_fragment,active=excluded.active,updated_at=now();
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'alliance_clue.save','heart_pair',p_pair_key,
    jsonb_build_object('active',p_active,'left_length',char_length(trim(p_left_fragment)),
      'right_length',char_length(trim(p_right_fragment))));
end;
$$;

-- Draw only the two confirmed phase-one social missions. Tricksters receive the
-- same ordinary task and visual feedback as guardians.
drop function if exists draw_guest_card(uuid);
create function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public
as $$
declare
  v_guest guests%rowtype; v_team text; v_role text; v_task tasks%rowtype;
  v_assignment assignments%rowtype; v_capacity integer; v_registration_open boolean;
  v_heart_code text;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select registration_open into v_registration_open from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' or not v_guest.eligible_for_mission then
    raise exception using errcode='P0001',message='guest_not_mission_eligible';
  end if;
  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a where a.guest_id=v_guest.id and a.is_initial limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_guest.story_role,v_task.id,v_task.title,v_task.description,
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

  if not v_guest.eligible_for_secret_role then v_role:='guest';
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
    select * into v_task from tasks where active and story_role_scope=v_guest.story_role
    order by mission_code limit 1;
  else
    select * into v_task from tasks where active and mission_code in('P1-007','P1-008')
    order by random() limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  if v_guest.story_role='HEART_HOLDER' then
    select heart_code into v_heart_code from heart_slots where guest_id is null
    order by random() for update skip locked limit 1;
    if v_heart_code is null then raise exception using errcode='P0001',message='heart_slot_missing'; end if;
    update heart_slots set guest_id=v_guest.id,assigned_at=now() where heart_code=v_heart_code;
  end if;
  update guests set team=v_team,role=v_role,drawn_at=now() where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,
    jsonb_build_object('team',v_team,'role',v_role,'story_role',v_guest.story_role,
      'assignment_id',v_assignment.id,'mission_code',v_task.mission_code,
      'heart_code',v_heart_code,'task_catalog_mode','live'));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

-- Phase-one tricksters complete the same task but earn no personal points. The
-- completion, rank and private success feedback still remain indistinguishable.
create or replace function approve_assignment(
  p_assignment_id uuid,p_actor text,p_reason text default 'Mission approved'
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_assignment assignments%rowtype; v_task_points integer; v_points integer;
  v_task_stage text; v_score_policy text; v_grants_hidden_spy boolean;
  v_total integer; v_rank integer; v_role text; v_team text; v_eligible_for_secret_role boolean;
  v_upgrade_limit integer; v_clue_limit integer; v_reward_task_id uuid;
  v_reward_assignment_id uuid; v_reward_clue_id uuid;
begin
  if nullif(trim(p_reason),'') is null then raise exception using errcode='22023',message='reason_required'; end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;
  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;
  select points,grants_hidden_spy,stage,score_policy into
    v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy
  from tasks where id=v_assignment.task_id;
  select points,role,team,eligible_for_secret_role into
    v_total,v_role,v_team,v_eligible_for_secret_role
  from guests where id=v_assignment.guest_id for update;
  v_points:=case when v_score_policy='NO_PERSONAL'
    or (v_assignment.is_initial and v_task_stage='task_round_1' and v_role='spy')
    then 0 else v_task_points end;

  if v_grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_role<>'guest' then raise exception using errcode='P0001',message='hidden_spy_guest_ineligible'; end if;
    if exists(select 1 from guests where is_hidden_spy and id<>v_assignment.guest_id) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
  end if;
  if v_points<>0 then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  end if;
  update guests set points=points+v_points,
    role=case when v_grants_hidden_spy then 'spy' else role end,
    is_hidden_spy=case when v_grants_hidden_spy then true else is_hidden_spy end
  where id=v_assignment.guest_id
  returning points,role,team,eligible_for_secret_role into v_total,v_role,v_team,v_eligible_for_secret_role;
  update assignments set status='approved',approved_at=now() where id=v_assignment.id;

  if v_assignment.is_initial then
    select upgrade_reward_limit,clue_reward_limit into v_upgrade_limit,v_clue_limit from game_state where id=1;
    select count(*)::integer into v_rank from assignments where is_initial and status='approved';
    update assignments set completion_rank=v_rank where id=v_assignment.id;
    if v_role<>'spy' and v_rank<=v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t
      where t.active and t.category='upgrade' and t.stage='task_round_2'
        and t.role_scope in('all',v_role)
        and not exists(select 1 from assignments a where a.guest_id=v_assignment.guest_id and a.task_id=t.id)
      order by random() limit 1;
      if v_reward_task_id is not null then
        insert into assignments(guest_id,task_id) values(v_assignment.guest_id,v_reward_task_id)
        returning id into v_reward_assignment_id;
        update assignments set reward_task_id=v_reward_task_id where id=v_assignment.id;
      end if;
    end if;
    if v_rank<=v_clue_limit and v_eligible_for_secret_role and v_role<>'spy' then
      select c.id into v_reward_clue_id from clues c where c.active
        and not exists(select 1 from guest_clues gc where gc.guest_id=v_assignment.guest_id and gc.clue_id=c.id)
        and(c.spy_guest_id is null or exists(select 1 from guests spy
          where spy.id=c.spy_guest_id and spy.team=v_team and spy.role='spy'))
      order by case when c.spy_guest_id is not null then 0 else 1 end,c.level,random() limit 1;
      if v_reward_clue_id is not null then
        insert into guest_clues(guest_id,clue_id,granted_by)
        values(v_assignment.guest_id,v_reward_clue_id,p_actor);
        update assignments set reward_clue_id=v_reward_clue_id where id=v_assignment.id;
      end if;
    end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object('guest_id',v_assignment.guest_id,'task_points',v_task_points,
      'points_awarded',v_points,'reason',trim(p_reason),'completion_rank',v_rank,
      'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,
      'hidden_spy_activated',v_grants_hidden_spy,'secret_clue_eligible',v_eligible_for_secret_role,
      'score_policy',v_score_policy));
  return jsonb_build_object('points_awarded',v_points,'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',v_reward_assignment_id,'reward_clue_id',v_reward_clue_id,
    'hidden_spy_activated',v_grants_hidden_spy);
end;
$$;

create or replace function approve_assignment_with_verification(
  p_assignment_id uuid,p_actor text,p_verification_note text
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_result jsonb; v_guest_id uuid; v_rank integer; v_role text; v_eligible boolean;
  v_bonus_awarded integer:=0;
begin
  if nullif(trim(p_verification_note),'') is null or length(trim(p_verification_note))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;
  v_result:=approve_assignment(p_assignment_id,p_actor,trim(p_verification_note));
  select a.guest_id,a.completion_rank,g.role,g.eligible_for_personal_score
  into v_guest_id,v_rank,v_role,v_eligible
  from assignments a join guests g on g.id=a.guest_id where a.id=p_assignment_id;
  if v_rank between 1 and 3 and v_role<>'spy' and v_eligible then
    update assignments set early_bonus_points=1 where id=p_assignment_id and early_bonus_points=0
    returning guest_id into v_guest_id;
    if found then
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_guest_id,1,'首轮任务前三名额外奖励',p_actor);
      update guests set points=points+1 where id=v_guest_id;
      insert into audit_log(actor,action,target_type,target_id,details)
      values(p_actor,'assignment.early_bonus','assignment',p_assignment_id::text,
        jsonb_build_object('guest_id',v_guest_id,'completion_rank',v_rank,'points',1,'backfill',false));
      v_bonus_awarded:=1;
    end if;
  end if;
  update assignments set verification_note=trim(p_verification_note),verified_by=p_actor,verified_at=now()
  where id=p_assignment_id;
  return v_result||jsonb_build_object('early_bonus_points',v_bonus_awarded);
end;
$$;

create or replace function reset_final_mission_story_runtime()
returns trigger language plpgsql set search_path=public as $$
begin
  delete from player_relationships;
  delete from trickster_signal_attempts;
  update heart_slots set guest_id=null,assigned_at=null;
  update guests set unlocked_role='NONE';
  return new;
end;
$$;
drop trigger if exists reset_final_mission_story_runtime on rehearsal_resets;
create trigger reset_final_mission_story_runtime
after insert on rehearsal_resets for each row execute function reset_final_mission_story_runtime();

revoke all on function complete_system_mission(uuid,text,text,text) from public,anon,authenticated;
revoke all on function request_player_connection(uuid,text,text) from public,anon,authenticated;
revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
revoke all on function configure_guest_story_role(uuid,text,text) from public,anon,authenticated;
revoke all on function save_alliance_clue_fragment(text,text,text,text,boolean,text) from public,anon,authenticated;
revoke all on function set_game_stage(text,text) from public,anon,authenticated;
revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
revoke all on function approve_assignment_with_verification(uuid,text,text) from public,anon,authenticated;
revoke all on function reset_final_mission_story_runtime() from public,anon,authenticated;
grant execute on function request_player_connection(uuid,text,text) to service_role;
grant execute on function configure_guest_story_role(uuid,text,text) to service_role;
grant execute on function save_alliance_clue_fragment(text,text,text,text,boolean,text) to service_role;
grant execute on function set_game_stage(text,text) to service_role;
grant execute on function draw_guest_card(uuid) to service_role;
grant execute on function approve_assignment(uuid,text,text) to service_role;
grant execute on function approve_assignment_with_verification(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607290045','mission.final_story_install','game_state','1',jsonb_build_object(
  'official_phase_one_tasks',8,'phase_two_decoys',5,'trickster_signal_task',true,
  'heart_slots',5,'task_catalog_mode','live'));

commit;
