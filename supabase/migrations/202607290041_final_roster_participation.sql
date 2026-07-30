-- Final guest roster and the revised rule that every invited guest may use the app.
-- Honor guests and the couple receive dedicated cards instead of random missions.
begin;

alter table guests add column if not exists participation_mode text not null default 'ACTIVE_PLAYER';
alter table guests add column if not exists relationship text not null default '';
alter table guests add column if not exists story_role text not null default 'NONE';
alter table guests add column if not exists uses_app boolean not null default true;
alter table guests add column if not exists eligible_for_mission boolean not null default true;
alter table guests add column if not exists eligible_for_secret_role boolean not null default true;
alter table guests add column if not exists eligible_for_personal_score boolean not null default true;
alter table guests add column if not exists special_card_title text not null default '';
alter table guests add column if not exists special_card_body text not null default '';
alter table tasks add column if not exists story_role_scope text not null default 'NONE';

do $$ begin
  if not exists(select 1 from pg_constraint where conname='guests_participation_mode_check') then
    alter table guests add constraint guests_participation_mode_check
      check(participation_mode in ('ACTIVE_PLAYER','HONOR_GUEST','PRINCIPAL'));
  end if;
  if not exists(select 1 from pg_constraint where conname='guests_story_role_check') then
    alter table guests add constraint guests_story_role_check
      check(story_role in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER'));
  end if;
  if not exists(select 1 from pg_constraint where conname='tasks_story_role_scope_check') then
    alter table tasks add constraint tasks_story_role_scope_check
      check(story_role_scope in ('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER'));
  end if;
end $$;

insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,is_demo,story_role_scope)
select '誓词引导人','你被选为今天的誓词引导人。请暂时保守这个秘密。工作人员会在仪式开始前与你确认流程；在指定环节，请引导新人完成誓词。','由主持人或主办方在仪式结束后确认。',1,'guest','ceremony','task_round_1',true,false,'OFFICIANT'
where not exists(select 1 from tasks where story_role_scope='OFFICIANT');

insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,is_demo,story_role_scope)
select '戒指守护者','丘比特将一项重要使命交给了你。请在工作人员提示后领取戒指盒，并在交换戒指环节将它送到新人身边。在此之前，请不要公开你的任务。','由主持人或主办方在交换戒指环节后确认。',1,'guest','ceremony','task_round_1',true,false,'RING_KEEPER'
where not exists(select 1 from tasks where story_role_scope='RING_KEEPER');

update tasks set active=true,is_demo=false where story_role_scope in ('OFFICIANT','RING_KEEPER');

create temporary table final_wedding_roster_v1(
  old_login text primary key,
  final_name text not null,
  final_login text not null unique,
  participation_mode text not null,
  relationship text not null,
  story_role text not null,
  is_elder boolean not null,
  special_card_title text not null,
  special_card_body text not null,
  staff_notes text not null
);

insert into final_wedding_roster_v1 values
('Andao Chen','陈安道 Andao Chen','Andao Chen','ACTIVE_PLAYER','女方弟弟','RING_KEEPER',false,'','','负责送戒指；固定剧情职务，不进入恶作剧者池'),
('Anrong','Anrong','Anrong','PRINCIPAL','新娘','NONE',false,'新娘的秘密席位','今天的惊喜仍在准备中。你不需要抽取普通任务，请先好好享受属于你的婚礼。','预留新娘专属惊喜，不进入普通任务系统'),
('April Huijie Huang','黄会杰 Huijie Huang','Huijie Huang','ACTIVE_PLAYER','','NONE',false,'','',''),
('Feifei Xie','Feifei Xie','Feifei Xie','ACTIVE_PLAYER','','NONE',false,'','',''),
('Florence Yirui Zhang','张昳睿 Yirui Zhang','Yirui Zhang','ACTIVE_PLAYER','','NONE',false,'','',''),
('Huimin Xu','Huimin Xu','Huimin Xu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Tang-Ling Yeh','Tang-Ling Yeh','Tang-Ling Yeh','ACTIVE_PLAYER','','NONE',false,'','',''),
('Tracey','石天意 Tianyi Shi','Tianyi Shi','ACTIVE_PLAYER','','NONE',false,'','','替换原 Tracey'),
('Wenli Xu','徐闻立 Wenli Xu','Wenli Xu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Yi Ren','Yi Ren','Yi Ren','ACTIVE_PLAYER','','NONE',false,'','',''),
('Yue Liu','刘玥 Yue Liu','Yue Liu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Zikun Zheng','郑子坤 Zikun Zheng','Zikun Zheng','ACTIVE_PLAYER','','NONE',false,'','',''),
('Zimin Jin','Zimin Jin','Zimin Jin','PRINCIPAL','新郎','NONE',false,'新郎的特别席位','今天不需要抽取普通任务。请和新娘一起享受婚礼；属于新郎的内容会在这里单独出现。','新郎，不进入普通任务系统'),
('Yifan Yu','俞一凡 Yifan Yu','Yifan Yu','ACTIVE_PLAYER','','OFFICIANT',false,'','','誓词引导人；固定剧情职务，不进入恶作剧者池'),
('Junheng Liu','刘俊恒 Junheng Liu','Junheng Liu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Gang Yao','姚刚 Gang Yao','Gang Yao','ACTIVE_PLAYER','','NONE',false,'','',''),
('Luyi Sun','孙露仪 Luyi Sun','Luyi Sun','ACTIVE_PLAYER','','NONE',false,'','',''),
('Ruochen Xu','徐若尘 Ruochen Xu','Ruochen Xu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Moshuang Xu','徐莫双 Moshuang Xu','Moshuang Xu','ACTIVE_PLAYER','','NONE',false,'','',''),
('Siran Li','李思然 Siran Li','Siran Li','ACTIVE_PLAYER','','NONE',false,'','',''),
('Danying Yang','杨丹莹 Danying Yang','Danying Yang','HONOR_GUEST','男方妈妈','NONE',true,'荣誉任务 · 家庭守护者','你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。','荣誉宾客；登录后领取荣誉任务'),
('Chulan Fan','樊出蓝 Chulan Fan','Chulan Fan','ACTIVE_PLAYER','','NONE',false,'','',''),
('Qianyi Wang','王倩怡 Wang Qianyi','Qianyi Wang','ACTIVE_PLAYER','','NONE',false,'','',''),
('Zixi Wang','王子曦 Zixi Wang','Zixi Wang','ACTIVE_PLAYER','','NONE',false,'','',''),
('Liying Jin','金丽英 Liying Jin','Liying Jin','HONOR_GUEST','男方大姑姑','NONE',true,'荣誉任务 · 家庭守护者','你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。','荣誉宾客；登录后领取荣誉任务'),
('Jialai Jin','金嘉来 Jialai Jin','Jialai Jin','ACTIVE_PLAYER','','NONE',false,'','',''),
('Jianjun Jin','金建军 Jianjun Jin','Jianjun Jin','HONOR_GUEST','男方婶婶','NONE',true,'荣誉任务 · 家庭守护者','你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。','荣誉宾客；登录后领取荣誉任务'),
('Xingcheng Jin','金星澄 Xingcheng Jin','Xingcheng Jin','ACTIVE_PLAYER','男方妹妹','RING_KEEPER',false,'','','负责送戒指；固定剧情职务，不进入恶作剧者池'),
('Xiaofeng Jin','金晓峰 Xiaofeng Jin','Xiaofeng Jin','HONOR_GUEST','男方爸爸','NONE',true,'荣誉任务 · 家庭守护者','你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。','荣誉宾客；登录后领取荣誉任务'),
('Ziyang Jin','金紫洋 Ziyang Jin','Ziyang Jin','ACTIVE_PLAYER','男方妹妹','NONE',false,'','','可以参与普通游戏'),
('Wei Jin','金维 Wei Jin','Wei Jin','HONOR_GUEST','男方小姑姑','NONE',true,'荣誉任务 · 家庭守护者','你的荣誉任务：见证新人建立自己的家庭，并在今天接受大家的感谢与祝福。无需参加普通挑战，也无需积分验证；请安心享受婚礼，你的到来本身就是最珍贵的祝福。','不参与普通游戏；登录后领取荣誉任务'),
('Fangzhou Chen','陈方舟 Fangzhou Chen','Fangzhou Chen','ACTIVE_PLAYER','','NONE',false,'','','');

-- User confirmed that rehearsal credentials and runtime progress are disposable.
update game_state set registration_open=false,voting_open=false,results_visible=false,scoreboard_visible=false where id=1;
update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null
where claimed_by is not null or claimed_at is not null or assignment_id is not null;
delete from result_rewards;
delete from votes;
delete from guest_clues;
delete from points_ledger;
delete from team_points_ledger;
delete from spy_points_ledger;
delete from team_resource_ledger;
delete from assignments;
delete from guest_sessions;
delete from guest_login_throttles;
update team_resources set balance=10,updated_at=now();
update awards set winner_guest_id=null,winner_team=null,reason='',published=false,updated_at=now();

update guests set team='未分组',role='guest',team_locked=false,role_locked=false,is_hidden_spy=false,
  points=0,claim_code_hash=null,claimed_at=null,drawn_at=null,
  participation_mode='ACTIVE_PLAYER',relationship='',story_role='NONE',uses_app=true,
  eligible_for_mission=true,eligible_for_secret_role=true,eligible_for_personal_score=true,
  special_card_title='',special_card_body='',is_elder=false,ceremony_eligible=false,staff_notes='';

update guests g set
  name=r.final_name,login_name=r.final_login,participation_mode=r.participation_mode,
  relationship=r.relationship,story_role=r.story_role,uses_app=true,
  eligible_for_mission=r.participation_mode='ACTIVE_PLAYER',
  eligible_for_secret_role=r.participation_mode='ACTIVE_PLAYER' and r.story_role='NONE',
  eligible_for_personal_score=r.participation_mode='ACTIVE_PLAYER',
  special_card_title=r.special_card_title,special_card_body=r.special_card_body,
  is_elder=r.is_elder,ceremony_eligible=r.story_role<>'NONE',active=true,staff_notes=r.staff_notes
from final_wedding_roster_v1 r
where lower(g.login_name)=lower(r.old_login) or lower(g.login_name)=lower(r.final_login);

do $$ declare v_matched integer; begin
  select count(*) into v_matched from guests g join final_wedding_roster_v1 r on lower(g.login_name)=lower(r.final_login);
  if v_matched<>32 then raise exception using errcode='P0001',message='final_roster_match_failed'; end if;
end $$;

update guests g set active=false,uses_app=false,eligible_for_mission=false,
  eligible_for_secret_role=false,eligible_for_personal_score=false
where not exists(select 1 from final_wedding_roster_v1 r where lower(r.final_login)=lower(g.login_name));

update game_state set stage='registration',voting_round=0,phase_note=null,
  display_title=null,display_body=null,public_clue=null,timer_ends_at=null,
  current_host_segment_id=null,voting_opened_at=null,voting_closed_at=null,
  results_published_at=null,registration_open=true,updated_at=now() where id=1;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607290041','guest.final_roster_apply','game_state','1',
  jsonb_build_object('roster_count',32,'runtime_cleared',true,'honor_guests_use_app',true));

create or replace function registration_guest_list(p_invitation_code text)
returns table(id uuid,name text,team text,claimed boolean)
language plpgsql security definer set search_path=public,extensions
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where game_state.id=1;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;
  return query select g.id,g.name,g.team,g.claim_code_hash is not null
  from guests g
  where g.active and g.uses_app and (v_state.registration_open or g.claim_code_hash is not null)
  order by g.name;
end;
$$;

drop function if exists claim_guest_by_login(text,text,text,text,timestamptz,text);
create function claim_guest_by_login(
  p_invitation_code text,p_login_name text,p_claim_code text,p_token_hash text,
  p_expires_at timestamptz,p_attempt_key text
) returns table(
  guest_id uuid,guest_name text,account_created boolean,auth_status text,retry_after_seconds integer
)
language plpgsql security definer set search_path=public,extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_throttle guest_login_throttles%rowtype;
  v_normalized_login text;
  v_account_created boolean:=false;
  v_failures integer;
  v_retry integer;
begin
  select * into v_state from game_state where game_state.id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;
  if p_claim_code is null or p_claim_code !~ '^[0-9]{4}$' then
    raise exception using errcode='22023',message='invalid_claim_code';
  end if;
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_attempt_key';
  end if;

  v_normalized_login:=lower(regexp_replace(trim(p_login_name),'\s+',' ','g'));
  select * into v_guest from guests
  where active and uses_app and lower(regexp_replace(trim(login_name),'\s+',' ','g'))=v_normalized_login
  for update;
  if not found then raise exception using errcode='P0002',message='invalid_login_name'; end if;

  if v_guest.claim_code_hash is null then
    if not v_state.registration_open then raise exception using errcode='P0001',message='registration_closed'; end if;
    update guests set claim_code_hash=crypt(p_claim_code,gen_salt('bf')),claimed_at=now() where id=v_guest.id;
    delete from guest_login_throttles where attempt_key=p_attempt_key;
    v_account_created:=true;
  else
    delete from guest_login_throttles where updated_at<now()-interval '1 day';
    insert into guest_login_throttles(attempt_key,guest_id) values(p_attempt_key,v_guest.id)
    on conflict(attempt_key) do nothing;
    select * into v_throttle from guest_login_throttles where attempt_key=p_attempt_key for update;
    if v_throttle.locked_until is not null and v_throttle.locked_until>now() then
      v_retry:=greatest(1,ceil(extract(epoch from (v_throttle.locked_until-now())))::integer);
      return query select null::uuid,null::text,false,'rate_limited'::text,v_retry; return;
    end if;
    if v_throttle.window_started_at<=now()-interval '10 minutes' then
      update guest_login_throttles set failure_count=0,window_started_at=now(),locked_until=null,updated_at=now()
      where attempt_key=p_attempt_key returning * into v_throttle;
    end if;
    if crypt(p_claim_code,v_guest.claim_code_hash)<>v_guest.claim_code_hash then
      v_failures:=least(5,v_throttle.failure_count+1);
      update guest_login_throttles set failure_count=v_failures,
        locked_until=case when v_failures>=5 then now()+interval '15 minutes' else null end,updated_at=now()
      where attempt_key=p_attempt_key;
      if v_failures>=5 then
        return query select null::uuid,null::text,false,'rate_limited'::text,900;
      else
        return query select null::uuid,null::text,false,'invalid_claim_code'::text,0;
      end if;
      return;
    end if;
    delete from guest_login_throttles where attempt_key=p_attempt_key;
    update guests set claimed_at=coalesce(claimed_at,now()) where id=v_guest.id;
  end if;
  insert into guest_sessions(guest_id,token_hash,expires_at) values(v_guest.id,p_token_hash,p_expires_at);
  return query select v_guest.id,v_guest.name,v_account_created,'ok'::text,0;
end;
$$;

drop function if exists draw_guest_card(uuid);
create function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_team text;
  v_role text;
  v_task tasks%rowtype;
  v_assignment assignments%rowtype;
  v_capacity integer;
  v_registration_open boolean;
  v_task_catalog_mode text;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select registration_open,task_catalog_mode into v_registration_open,v_task_catalog_mode
  from game_state where id=1 for share;
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
      v_task.verification_method,v_task.points,v_guest.drawn_at;
    return;
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

  if not v_guest.eligible_for_secret_role then
    v_role:='guest';
  elsif v_guest.role_locked then
    v_role:=v_guest.role;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team=v_team and role=v_role;
    if (v_role in ('spy','helper') and v_capacity>=1) or (v_role='guest' and v_capacity>=6) then
      raise exception using errcode='P0001',message='draw_preset_role_capacity_full';
    end if;
  else
    select slots.role_name into v_role from(
      select 'spy'::text role_name from generate_series(1,greatest(0,1-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='spy')))
      union all select 'helper'::text from generate_series(1,greatest(0,1-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='helper')))
      union all select 'guest'::text from generate_series(1,greatest(0,6-(select count(*)::integer from guests where drawn_at is not null and team=v_team and role='guest')))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' then
    select * into v_task from tasks where active and story_role_scope=v_guest.story_role order by created_at limit 1;
  else
    select * into v_task from tasks where active and story_role_scope='NONE' and stage='task_round_1'
      and category='standard' and role_scope=v_role
      and ((v_task_catalog_mode='demo' and is_demo) or (v_task_catalog_mode='live' and not is_demo))
    order by random() limit 1;
    if not found then
      select * into v_task from tasks where active and story_role_scope='NONE' and stage='task_round_1'
        and category='standard' and role_scope='all'
        and ((v_task_catalog_mode='demo' and is_demo) or (v_task_catalog_mode='live' and not is_demo))
      order by random() limit 1;
    end if;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  update guests set team=v_team,role=v_role,drawn_at=now() where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,
    jsonb_build_object('team',v_team,'role',v_role,'story_role',v_guest.story_role,
      'assignment_id',v_assignment.id,'task_catalog_mode',v_task_catalog_mode));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_task.id,v_task.title,v_task.description,
    v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

revoke all on function registration_guest_list(text) from public,anon,authenticated;
revoke all on function claim_guest_by_login(text,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function registration_guest_list(text) to service_role;
grant execute on function claim_guest_by_login(text,text,text,text,timestamptz,text) to service_role;
grant execute on function draw_guest_card(uuid) to service_role;

create or replace function enforce_assignment_guest_eligibility()
returns trigger language plpgsql set search_path=public as $$
declare v_story_role text; v_task_story_role text;
begin
  select story_role into v_story_role from guests where id=new.guest_id and active and eligible_for_mission;
  if not found then
    raise exception using errcode='P0001',message='guest_not_mission_eligible';
  end if;
  select story_role_scope into v_task_story_role from tasks where id=new.task_id;
  if v_task_story_role<>'NONE' and v_task_story_role<>v_story_role then
    raise exception using errcode='P0001',message='story_task_guest_mismatch';
  end if;
  return new;
end;
$$;
drop trigger if exists assignments_guest_eligibility_guard on assignments;
create trigger assignments_guest_eligibility_guard before insert or update of guest_id on assignments
for each row execute function enforce_assignment_guest_eligibility();

create or replace function enforce_personal_score_eligibility()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from guests where id=new.guest_id and active and eligible_for_personal_score) then
    raise exception using errcode='P0001',message='guest_not_personal_score_eligible';
  end if;
  return new;
end;
$$;
drop trigger if exists points_ledger_guest_eligibility_guard on points_ledger;
create trigger points_ledger_guest_eligibility_guard before insert or update of guest_id on points_ledger
for each row execute function enforce_personal_score_eligibility();

revoke all on function enforce_assignment_guest_eligibility() from public,anon,authenticated;
revoke all on function enforce_personal_score_eligibility() from public,anon,authenticated;
drop table final_wedding_roster_v1;

commit;
