-- Make the approved P1/P2 catalog the only source of formal assignments.
-- This migration is forward-only and preserves completed runtime history.

begin;

alter table tasks add column if not exists formal_allowed boolean not null default false;

-- A complete second act is exactly one official assignment for each of the 20
-- unlocked profiles, with the organizer-approved mission multiset and team
-- power distribution.  The helper is intentionally server-only.
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
    where g.id is null or not g.active or not g.phase_two_eligible
      or g.drawn_at is null or g.team is distinct from p.team
  ) then
    return false;
  end if;

  if (
    select count(*)
    from assignments a
    join tasks t on t.id=a.task_id
    where a.status<>'cancelled' and t.mission_code like 'P2-%'
  )<>20 then
    return false;
  end if;

  if exists(
    select 1
    from phase_two_profiles p
    left join assignments a
      on a.guest_id=p.guest_id and a.status<>'cancelled'
    left join tasks t
      on t.id=a.task_id and t.mission_code like 'P2-%'
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

-- Do not let one stale/arbitrary P2 assignment make the unlock path report
-- success.  Existing assignments are idempotent only when the whole official
-- 20-player set is present and internally consistent.
create or replace function unlock_phase_two_missions(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
begin
  if exists(select 1 from phase_two_profiles p where p.primary_mission='TEAM_CAPTAIN' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='STAR' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='guiding_star_origin_invalid';
  end if;
  if exists(select 1 from phase_two_profiles p where p.primary_mission='COPY_SCORE' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='HEART' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='lonely_cupid_origin_invalid';
  end if;

  if exists(
    select 1 from assignments a join tasks t on t.id=a.task_id
    where t.mission_code like 'P2-%'
  ) then
    if phase_two_official_assignment_set_complete() then
      perform settle_phase_two_lucky(p_actor);
      return 20;
    end if;
    raise exception using errcode='P0001',message='phase_two_existing_assignments_incomplete';
  end if;

  delete from phase_two_dilemmas where true;
  delete from phase_two_copy_choices where true;
  v_count:=unlock_phase_two_missions_assignments_v1(p_actor);
  -- The original generator marked an unrelated player on the other team as a
  -- second captain. Derive every power flag from the actual official mission
  -- so the assignment and profile can never disagree.
  update phase_two_profiles set
    extra_vote=(primary_mission='EXTRA_VOTE'),
    super_lucky=(primary_mission='SUPER_LUCKY'),
    is_captain=(primary_mission='TEAM_CAPTAIN'),updated_at=now()
  where true;
  if v_count<>20 or not phase_two_official_assignment_set_complete() then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;
  perform settle_phase_two_lucky(p_actor);
  return 20;
end;
$$;

revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
grant execute on function unlock_phase_two_missions(text) to service_role;

-- Exclude the lucky-star multiplier by its stable official mission identity.
-- Human-readable ledger reasons are presentation copy and must not control
-- settlement behavior.
create or replace function settle_phase_two_copy_and_captain(p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_copy phase_two_copy_choices%rowtype;
  v_copy_profile phase_two_profiles%rowtype;
  v_target_profile phase_two_profiles%rowtype;
  v_copy_points integer:=0;
  v_assignment_id uuid;
  v_top_team_score integer;
  v_captain phase_two_profiles%rowtype;
  v_captain_points integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-personal-settlement-v1'));
  select * into v_copy_profile from phase_two_profiles where primary_mission='COPY_SCORE' for update;
  if found then
    select * into v_copy from phase_two_copy_choices where guest_id=v_copy_profile.guest_id for update;
    if found and v_copy.settled_at is null then
      select * into v_target_profile from phase_two_profiles where guest_id=v_copy.target_guest_id;
      select coalesce(sum(l.amount),0)::integer into v_copy_points
      from points_ledger l
      join assignments source_assignment on source_assignment.id=l.assignment_id
      join tasks source_task on source_task.id=source_assignment.task_id
      where l.guest_id=v_copy.target_guest_id
        and l.created_at>=v_target_profile.unlocked_at
        and source_task.stage='task_round_2'
        and source_task.mission_code like 'P2-%'
        and source_task.mission_code not in(
          'P2-LONELY-001','P2-GUIDE-001','P2-TRICKSTER-001','P2-POWER-001','P2-LUCKY-001'
        );
      if v_copy_points>0 then
        select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=v_copy_profile.guest_id and t.mission_code='P2-LONELY-001' limit 1;
        insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
        values(v_copy_profile.guest_id,v_assignment_id,v_copy_points,'孤单丘比特 · 命运复制',p_actor);
        update guests set points=points+v_copy_points where id=v_copy_profile.guest_id;
      end if;
      update phase_two_copy_choices set settled_points=v_copy_points,settled_at=now()
      where guest_id=v_copy_profile.guest_id;
      update assignments set status='approved',approved_at=now(),verified_at=now(),verification_note='命运复制已由系统结算'
      where guest_id=v_copy_profile.guest_id and task_id=(select id from tasks where mission_code='P2-LONELY-001');
    end if;
  end if;

  select max(score) into v_top_team_score from(
    select team,coalesce(sum(amount),0)::integer score from team_points_ledger
    where team in('海岛组','沙漠组') group by team) totals;
  select * into v_captain from phase_two_profiles where primary_mission='TEAM_CAPTAIN' for update;
  if found and v_captain.captain_bonus_settled_at is null then
    if coalesce(v_top_team_score,0)>0 and
        (select coalesce(sum(amount),0) from team_points_ledger where team=v_captain.team)=v_top_team_score then
      select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_captain.guest_id and t.mission_code='P2-GUIDE-001' limit 1;
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_captain.guest_id,v_assignment_id,4,'领航星队长 · 团队第一',p_actor);
      update guests set points=points+4 where id=v_captain.guest_id;
      v_captain_points:=4;
    end if;
    update phase_two_profiles set captain_bonus_settled_at=now(),updated_at=now() where guest_id=v_captain.guest_id;
    update assignments set status='approved',approved_at=now(),verified_at=now(),
      verification_note=case when v_captain_points=4 then '所在团队获得第一，系统奖励 4 分' else '团队排名已结算' end
    where guest_id=v_captain.guest_id and task_id=(select id from tasks where mission_code='P2-GUIDE-001');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_two.personal_settle','game_state','1',jsonb_build_object(
    'copy_points',v_copy_points,'captain_points',v_captain_points));
  return jsonb_build_object('copy_points',v_copy_points,'captain_points',v_captain_points);
end;
$$;

revoke all on function settle_phase_two_copy_and_captain(text) from public,anon,authenticated;
grant execute on function settle_phase_two_copy_and_captain(text) to service_role;

-- Shared validator for genuinely manual/custom tasks. Official P1/P2 tasks are
-- assigned only by their draw/unlock workflows, never by a generic operator
-- action or a physical-code shortcut.
create or replace function validate_manual_task_assignment(
  p_guest_id uuid,
  p_task_id uuid,
  p_exclude_assignment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_task tasks%rowtype;
  v_stage text;
  v_used integer;
begin
  select * into v_guest from guests where id=p_guest_id for update;
  if not found or not v_guest.active then
    raise exception using errcode='P0002',message='guest_not_found';
  end if;
  if not v_guest.uses_app or v_guest.participation_mode<>'ACTIVE_PLAYER'
      or not v_guest.eligible_for_mission or v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='manual_task_guest_ineligible';
  end if;

  select * into v_task from tasks where id=p_task_id for update;
  if not found or not v_task.active or v_task.is_demo then
    raise exception using errcode='P0002',message='task_not_found';
  end if;
  if v_task.mission_code ~* '^P[12]-' then
    raise exception using errcode='P0001',message='official_task_manual_assignment_forbidden';
  end if;
  if v_task.role_scope not in('all',v_guest.role)
      or v_task.story_role_scope not in('NONE',v_guest.story_role) then
    raise exception using errcode='P0001',message='manual_task_role_ineligible';
  end if;

  select stage into v_stage from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_task.stage='task_round_1' and not phase_one_interactions_open(v_stage) then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='task_round_2' and v_stage not in('task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='group_game' and v_stage<>'group_game' then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  end if;

  if v_task.max_assignments is not null then
    select count(*)::integer into v_used from assignments a
    where a.task_id=v_task.id and a.status<>'cancelled'
      and a.id is distinct from p_exclude_assignment_id;
    if v_used>=v_task.max_assignments then
      raise exception using errcode='P0001',message='manual_task_capacity_full';
    end if;
  end if;
end;
$$;

revoke all on function validate_manual_task_assignment(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function assign_task_to_guest(p_guest_id uuid,p_task_id uuid,p_actor text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment_id uuid;
  v_guest guests%rowtype;
  v_task tasks%rowtype;
begin
  perform validate_manual_task_assignment(p_guest_id,p_task_id,null);
  select * into v_guest from guests where id=p_guest_id for update;
  select * into v_task from tasks where id=p_task_id for update;

  if v_task.grants_hidden_spy then
    perform pg_advisory_xact_lock(hashtext('wedding-hidden-spy-activation-v1'));
    if v_guest.role<>'guest' or v_guest.is_hidden_spy or not v_guest.eligible_for_secret_role then
      raise exception using errcode='P0001',message='hidden_spy_guest_ineligible';
    end if;
    if exists(select 1 from guests where is_hidden_spy) then
      raise exception using errcode='P0001',message='hidden_spy_already_activated';
    end if;
    if exists(select 1 from assignments a join tasks t on t.id=a.task_id where t.grants_hidden_spy) then
      raise exception using errcode='P0001',message='hidden_spy_task_already_assigned';
    end if;
  end if;

  insert into assignments(guest_id,task_id) values(p_guest_id,p_task_id)
  on conflict on constraint assignments_guest_id_task_id_key do nothing
  returning id into v_assignment_id;
  if v_assignment_id is null then raise exception using errcode='23505',message='task_already_assigned'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.create','assignment',v_assignment_id::text,
    jsonb_build_object('guest_id',p_guest_id,'task_id',p_task_id,'grants_hidden_spy',v_task.grants_hidden_spy,'manual',true));
  return v_assignment_id;
end;
$$;

create or replace function reassign_task_assignment(
  p_assignment_id uuid,p_task_id uuid,p_actor text,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old assignments%rowtype;
  v_old_mission_code text;
  v_new_id uuid;
begin
  if char_length(trim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  select * into v_old from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_old.status='approved' then raise exception using errcode='P0001',message='assignment_already_completed'; end if;
  if v_old.status='cancelled' then raise exception using errcode='P0001',message='assignment_not_reassignable'; end if;
  select mission_code into v_old_mission_code from tasks where id=v_old.task_id;
  if v_old_mission_code ~* '^P[12]-' then
    raise exception using errcode='P0001',message='official_task_manual_assignment_forbidden';
  end if;

  perform validate_manual_task_assignment(v_old.guest_id,p_task_id,v_old.id);
  if exists(select 1 from assignments where guest_id=v_old.guest_id and task_id=p_task_id) then
    raise exception using errcode='23505',message='task_already_assigned';
  end if;
  insert into assignments(guest_id,task_id,is_initial,replacement_for_assignment_id)
  values(v_old.guest_id,p_task_id,v_old.is_initial,v_old.id) returning id into v_new_id;
  update assignments set status='cancelled',cancelled_at=now(),is_initial=false,replaced_by_assignment_id=v_new_id where id=v_old.id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.reassign','assignment',v_new_id::text,jsonb_build_object(
    'previous_assignment_id',v_old.id,'guest_id',v_old.guest_id,'previous_task_id',v_old.task_id,
    'task_id',p_task_id,'reason',trim(p_reason),'manual',true));
  return v_new_id;
end;
$$;

revoke all on function assign_task_to_guest(uuid,uuid,text) from public,anon,authenticated;
revoke all on function reassign_task_assignment(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function assign_task_to_guest(uuid,uuid,text) to service_role;
grant execute on function reassign_task_assignment(uuid,uuid,text,text) to service_role;

create or replace function issue_hidden_task_code(p_task_id uuid,p_code_hash text,p_actor text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
begin
  raise exception using errcode='P0001',message='hidden_task_codes_retired';
end;
$$;

revoke all on function issue_hidden_task_code(uuid,text,text) from public,anon,authenticated,service_role;

-- Fully retire the removed applause role. Completed rows remain as immutable
-- history; only unfinished leftovers are cancelled.
with retired as (
  update assignments a
  set status='cancelled',cancelled_at=coalesce(a.cancelled_at,now()),
      rejection_reason='剧情调整：掌声发起者任务已取消'
  from tasks t
  where a.task_id=t.id and t.mission_code='P1-CER-005'
    and a.status in('assigned','submitted','rejected')
  returning a.id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130002','legacy_applause_assignments.cancelled','assignments','batch',
  jsonb_build_object('count',count(*),'approved_history_preserved',true)
from retired;

update tasks set active=false where mission_code='P1-CER-005';

update guests set story_role='NONE',ceremony_eligible=false,role='guest',
  eligible_for_secret_role=phase_two_eligible,
  role_locked=not phase_two_eligible
where drawn_at is null and story_role='APPLAUSE_STARTER';

-- A currently drawn rehearsal row may still carry the retired enum value.
-- Preserve its team, drawn card and role while removing only the retired
-- ceremony marker so the tightened constraint is safe on every database.
update guests set story_role='NONE',ceremony_eligible=false
where story_role='APPLAUSE_STARTER';

update guests set story_role='OFFICIANT',ceremony_eligible=true,role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='yifan yu';
update guests set story_role='RING_KEEPER',ceremony_eligible=true,role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and lower(login_name) in('xingcheng jin','andao chen');
update guests set story_role='GROOM_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='siran li';
update guests set story_role='BRIDE_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='moshuang xu';
update guests set story_role='NONE',ceremony_eligible=false,role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and lower(login_name) in('feifei xie','luyi sun','yirui zhang');

alter table guests drop constraint if exists guests_story_role_check;
alter table guests add constraint guests_story_role_check check(
  story_role in('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','HEART_HOLDER','STAR_HOLDER')
);

create or replace function configure_guest_story_role(p_guest_id uuid,p_story_role text,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_guest guests%rowtype; v_limit integer; v_used integer;
begin
  if p_story_role not in('NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','HEART_HOLDER','STAR_HOLDER') then
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
    ceremony_eligible=p_story_role in('OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER'),
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

revoke all on function configure_guest_story_role(uuid,text,text) from public,anon,authenticated;
grant execute on function configure_guest_story_role(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130002','official_task.boundaries_hardened','game_state','1',jsonb_build_object(
  'phase_two_exact_assignments',20,
  'copy_excludes_mission_code','P2-LUCKY-001',
  'formal_manual_assignment_blocked',true,
  'applause_role_retired',true,
  'completed_history_preserved',true
));

commit;
