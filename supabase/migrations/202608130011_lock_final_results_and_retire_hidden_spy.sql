-- Treat the first public result settlement as a terminal scoring boundary and
-- retire the obsolete "hidden third spy" task/card path.  Rehearsal reset is
-- the only supported way to begin a fresh run.

begin;

-- Retire every hidden-spy assignment, including an approved rehearsal row.
-- Ledger/audit history remains immutable, while no obsolete card survives as
-- an active guest mission.
with legacy as (
  select a.id,a.status previous_status from assignments a join tasks t on t.id=a.task_id
  where t.grants_hidden_spy and a.status<>'cancelled'
), retired as (
  update assignments a set
    status='cancelled',cancelled_at=coalesce(cancelled_at,now()),
    rejection_reason='剧情调整：隐藏恶作剧者功能已取消'
  from legacy l where a.id=l.id
  returning a.id,l.previous_status
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130011','hidden_spy_assignment.retired','assignment',id::text,
  jsonb_build_object('previous_status',previous_status,'ledger_preserved',true,'audit_preserved',true)
from retired;

update tasks set active=false where grants_hidden_spy and active;
delete from hidden_task_codes where true;

create or replace function issue_hidden_task_code(p_task_id uuid,p_code_hash text,p_actor text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  raise exception 'hidden_task_codes_retired' using errcode='P0001';
end;
$$;

create or replace function redeem_hidden_task_code(p_guest_id uuid,p_code_hash text,p_actor text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  raise exception 'hidden_task_codes_retired' using errcode='P0001';
end;
$$;

-- A legacy hidden spy may still be the target of an old clue. The canonical
-- referenced-spy trigger correctly prevents changing that guest's role while
-- such a reference exists, so retire and detach those clue targets first.
-- Keep both the clue row and every guest_clues grant for audit/history.
with retired_clues as (
  update clues set active=false,spy_guest_id=null
  where spy_guest_id in (select id from guests where is_hidden_spy)
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130011','hidden_spy_clues.detached','clues','batch',
  jsonb_build_object('count',count(*),'clue_rows_preserved',true,'grants_preserved',true)
from retired_clues;

with cleared as(
  update guests set role=case when is_hidden_spy then 'guest' else role end,
    is_hidden_spy=false,hidden_role='NONE'
  where is_hidden_spy or hidden_role<>'NONE'
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130011','hidden_spy_runtime.cleared','guests','batch',
  jsonb_build_object('count',count(*)) from cleared;

create or replace function guard_retired_and_official_task_catalog()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='DELETE' then
    if coalesce(old.mission_code,'') ~* '^P[12]-' then
      raise exception using errcode='P0001',message='official_task_catalog_locked';
    end if;
    return old;
  end if;
  if new.grants_hidden_spy then
    raise exception using errcode='P0001',message='hidden_spy_feature_retired';
  end if;
  if tg_op='INSERT' and coalesce(new.mission_code,'') ~* '^P[12]-' then
    raise exception using errcode='P0001',message='official_task_code_insertion_forbidden';
  end if;
  if tg_op='UPDATE' and coalesce(new.mission_code,'') ~* '^P[12]-'
      and new.mission_code is distinct from old.mission_code then
    raise exception using errcode='P0001',message='official_task_code_insertion_forbidden';
  end if;
  if tg_op='UPDATE' and coalesce(old.mission_code,'') ~* '^P[12]-' and (
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.verification_method is distinct from old.verification_method
      or new.points is distinct from old.points
      or new.role_scope is distinct from old.role_scope
      or new.category is distinct from old.category
      or new.stage is distinct from old.stage
      or new.active is distinct from old.active
      or new.grants_hidden_spy is distinct from old.grants_hidden_spy
      or new.is_demo is distinct from old.is_demo
      or new.story_role_scope is distinct from old.story_role_scope
      or new.mission_code is distinct from old.mission_code
      or new.mechanic is distinct from old.mechanic
      or new.score_policy is distinct from old.score_policy
      or new.assignment_mode is distinct from old.assignment_mode
      or new.verification_type is distinct from old.verification_type
      or new.max_assignments is distinct from old.max_assignments
      or new.formal_allowed is distinct from old.formal_allowed
    ) then
    raise exception using errcode='P0001',message='official_task_catalog_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_retired_and_official_task_catalog on tasks;
create trigger guard_retired_and_official_task_catalog
before insert or update or delete on tasks
for each row execute function guard_retired_and_official_task_catalog();

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default 'Mission approved'
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_task_points integer;
  v_points integer;
  v_task_stage text;
  v_score_policy text;
  v_grants_hidden_spy boolean;
  v_total integer;
  v_rank integer;
  v_bonus_awarded integer:=0;
begin
  if nullif(trim(p_reason),'') is null then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if exists(select 1 from assignments where id=p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;

  select * into v_assignment from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002',message='assignment_not_found'; end if;
  if v_assignment.status<>'submitted' then
    raise exception using errcode='P0001',message='assignment_not_submitted';
  end if;

  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select points,grants_hidden_spy,stage,score_policy
  into v_task_points,v_grants_hidden_spy,v_task_stage,v_score_policy
  from tasks where id=v_assignment.task_id;
  if v_grants_hidden_spy then
    raise exception using errcode='P0001',message='hidden_spy_feature_retired';
  end if;

  select points into v_total
  from guests where id=v_assignment.guest_id for update;
  v_points:=case
    when v_score_policy='NO_PERSONAL' then 0
    else v_task_points
  end;

  if v_points<>0 then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(v_assignment.guest_id,v_assignment.id,v_points,trim(p_reason),p_actor);
  end if;
  update guests set points=points+v_points where id=v_assignment.guest_id
  returning points into v_total;
  update assignments set status='approved',approved_at=now(),reward_task_id=null,
    reward_clue_id=null where id=v_assignment.id;

  -- Rank only first-act completions that actually award personal points. This
  -- keeps a zero-point story card from consuming one of the three early slots.
  -- The bonus lives in the core approval function so system-confirmed pairings
  -- and staff-confirmed submissions follow exactly the same rule.
  if v_assignment.is_initial and v_points>0 then
    select count(*)::integer+1 into v_rank
    from assignments where is_initial and completion_rank is not null;
    update assignments set completion_rank=v_rank,
      early_bonus_points=case when v_rank between 1 and 3 then 1 else early_bonus_points end
    where id=v_assignment.id;
    if v_rank between 1 and 3 then
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_assignment.guest_id,1,'首轮任务前三名额外奖励',p_actor);
      update guests set points=points+1 where id=v_assignment.guest_id
      returning points into v_total;
      v_bonus_awarded:=1;
      insert into audit_log(actor,action,target_type,target_id,details)
      values(p_actor,'assignment.early_bonus','assignment',v_assignment.id::text,
        jsonb_build_object('guest_id',v_assignment.guest_id,'completion_rank',v_rank,
          'points',1,'reward_policy','points_only'));
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.approve','assignment',v_assignment.id::text,
    jsonb_build_object(
      'guest_id',v_assignment.guest_id,'task_points',v_task_points,
      'points_awarded',v_points,'early_bonus_points',v_bonus_awarded,
      'reason',trim(p_reason),'completion_rank',v_rank,
      'reward_policy','points_only','reward_assignment_id',null,
      'reward_clue_id',null,'hidden_spy_activated',false));
  return jsonb_build_object(
    'points_awarded',v_points,'early_bonus_points',v_bonus_awarded,
    'guest_total',v_total,'completion_rank',v_rank,
    'reward_assignment_id',null,'reward_clue_id',null,'hidden_spy_activated',false);
end;
$$;

-- Recreate the verification wrapper after the points-only approval function.
-- Only the first three score-eligible, non-trickster first-act finishers get
-- the documented +1. It is idempotent and never creates a task or clue.
create or replace function approve_assignment_with_verification(
  p_assignment_id uuid,p_actor text,p_verification_note text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_result jsonb;
begin
  if nullif(trim(p_verification_note),'') is null or length(trim(p_verification_note))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;

  v_result:=approve_assignment(p_assignment_id,p_actor,trim(p_verification_note));
  update assignments set verification_note=trim(p_verification_note),
    verified_by=p_actor,verified_at=now() where id=p_assignment_id;
  return v_result;
end;
$$;

create or replace function reject_assignment(p_assignment_id uuid,p_actor text,p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception using errcode='22023',message='reason_required';
  end if;
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  update assignments set status='rejected',submitted_at=null,rejected_at=now(),
    rejection_reason=trim(p_reason)
  where id=p_assignment_id and status='submitted';
  if not found then raise exception using errcode='P0001',message='assignment_not_submitted'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.reject','assignment',p_assignment_id::text,
    jsonb_build_object('reason',trim(p_reason)));
end;
$$;

-- Results can be published repeatedly as an idempotent retry, but cannot be
-- hidden or followed by another voting round. Public-screen visibility remains
-- an independent scoreboard flag.
create or replace function set_game_flag(p_field text,p_value boolean,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  if p_field='voting_open' then
    if v_state.results_published_at is not null or exists(select 1 from result_rewards) then
      raise exception using errcode='P0001',message='final_results_locked';
    end if;
    if p_value and not v_state.voting_open then
      if v_state.stage not in('group_game','voting') then
        raise exception using errcode='P0001',message='voting_stage_not_ready';
      end if;
      if v_state.team_clues_settled_at is null then
        raise exception using errcode='P0001',message='team_clues_not_settled';
      end if;
      if not exists(select 1 from guests where active and drawn_at is not null) then
        raise exception using errcode='P0001',message='no_drawn_guests';
      end if;
      if v_state.phase_one_completed_at is null then perform finalize_phase_one_content(p_actor); end if;
      update game_state set registration_open=false,voting_open=true,results_visible=false,stage='voting',
        voting_round=voting_round+1,voting_opened_at=now(),voting_closed_at=null,
        current_host_segment_id=null,display_title=null,display_body=null,public_clue=null,
        timer_ends_at=null,updated_at=now() where id=1;
    elsif not p_value and v_state.voting_open then
      update game_state set voting_open=false,voting_closed_at=coalesce(voting_closed_at,now()),
        updated_at=now() where id=1;
    end if;
  elsif p_field='results_visible' then
    if not p_value then
      raise exception using errcode='P0001',message='results_publication_irreversible';
    end if;
    if v_state.voting_round<1 then
      raise exception using errcode='P0001',message='voting_not_started';
    end if;
    if v_state.results_published_at is null then
      update game_state set voting_open=false,results_visible=true,stage='results',
        voting_closed_at=coalesce(voting_closed_at,now()),results_published_at=now(),
        current_host_segment_id=null,display_title=null,display_body=null,public_clue=null,
        timer_ends_at=null,updated_at=now() where id=1;
      perform settle_voting_results(v_state.voting_round,p_actor);
      perform settle_spy_results(v_state.voting_round,p_actor);
    else
      update game_state set voting_open=false,results_visible=true,stage='results',updated_at=now()
      where id=1;
    end if;
  elsif p_field='scoreboard_visible' then
    update game_state set scoreboard_visible=p_value,updated_at=now() where id=1;
  else
    raise exception using errcode='22023',message='invalid_game_flag';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.'||p_field,'game_state','1',jsonb_build_object(
    'value',p_value,'previous_stage',v_state.stage,
    'stage',(select stage from game_state where id=1),
    'voting_round',(select voting_round from game_state where id=1)));
end;
$$;

-- A completed trickster mission may upgrade only the ballot in the currently
-- open round; historical ballots are immutable.
create or replace function sync_completed_trickster_vote_weight()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_is_completed_trickster boolean:=false;
  v_updated integer:=0;
  v_round integer;
  v_open boolean;
begin
  if new.status<>'approved' then return new; end if;
  if tg_op='UPDATE' and old.status='approved' then return new; end if;

  select voting_round,voting_open into v_round,v_open from game_state where id=1;
  if not coalesce(v_open,false) then return new; end if;
  select exists(
    select 1 from tasks t
    join guests g on g.id=new.guest_id
    left join phase_two_profiles p on p.guest_id=new.guest_id
    where t.id=new.task_id and g.role='spy' and (
      t.mission_code='P2-TRICKSTER-001'
      or (t.mission_code='P1-TRICKSTER-001' and p.primary_mission='TRICKSTER' and p.unlocked_at is not null)
    )
  ) into v_is_completed_trickster;
  if not v_is_completed_trickster then return new; end if;

  update votes set vote_weight=2
  where voter_guest_id=new.guest_id and voting_round=v_round and vote_weight<>2;
  get diagnostics v_updated=row_count;
  if v_updated>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:trickster_vote_sync','vote.weight_upgraded','guest',new.guest_id::text,
      jsonb_build_object('assignment_id',new.id,'updated_ballots',v_updated,
        'voting_round',v_round,'vote_weight',2));
  end if;
  return new;
end;
$$;

create or replace function save_award(
  p_award_id uuid,p_title text,p_winner_guest_id uuid,p_winner_team text,
  p_reason text,p_sort_order integer,p_published boolean,p_actor text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if nullif(trim(p_title),'') is null or length(trim(p_title))>120 then raise exception using errcode='22023',message='invalid_award_title'; end if;
  if p_winner_guest_id is not null and p_winner_team is not null then raise exception using errcode='22023',message='award_winner_conflict'; end if;
  if p_winner_guest_id is not null and not exists(select 1 from guests where id=p_winner_guest_id) then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if p_winner_team is not null and p_winner_team not in('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_published and p_winner_guest_id is null and p_winner_team is null then raise exception using errcode='22023',message='award_winner_required'; end if;
  if length(coalesce(p_reason,''))>500 or p_sort_order<0 or p_sort_order>9999 then raise exception using errcode='22023',message='invalid_award_details'; end if;
  if p_award_id is null then
    insert into awards(title,winner_guest_id,winner_team,reason,sort_order,published)
    values(trim(p_title),p_winner_guest_id,p_winner_team,trim(coalesce(p_reason,'')),p_sort_order,p_published)
    returning id into v_id;
  else
    update awards set title=trim(p_title),winner_guest_id=p_winner_guest_id,winner_team=p_winner_team,
      reason=trim(coalesce(p_reason,'')),sort_order=p_sort_order,published=p_published,updated_at=now()
    where id=p_award_id returning id into v_id;
    if v_id is null then raise exception using errcode='P0002',message='award_not_found'; end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'award.save','award',v_id::text,jsonb_build_object(
    'title',trim(p_title),'winner_guest_id',p_winner_guest_id,
    'winner_team',p_winner_team,'published',p_published));
  return v_id;
end;
$$;

create or replace function deactivate_game_clue(p_clue_id uuid,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_title text;
begin
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  update clues set active=false where id=p_clue_id and active returning title into v_title;
  if not found then raise exception using errcode='P0002',message='clue_not_found'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.deactivate','clue',p_clue_id::text,
    jsonb_build_object('title',v_title,'existing_guest_grants_preserved',true));
end;
$$;

-- Clue contents are part of the published game record. Keep the guard in the
-- audited mutation RPC instead of on the table itself: rehearsal reset must be
-- able to delete the entire library after a published rehearsal.
create or replace function save_game_clue_v3(
  p_clue_id uuid,p_title text,p_content text,p_group_name text,p_team_scope text,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_group text:=trim(coalesce(p_group_name,''));
  v_existing clues%rowtype;
begin
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null or length(trim(p_title))>120
      or nullif(trim(coalesce(p_content,'')),'') is null or length(trim(p_content))>1000
      or v_group='' or length(v_group)>60 then
    raise exception using errcode='22023',message='clue_content_required';
  end if;
  if p_team_scope not in ('海岛组','沙漠组') then
    raise exception using errcode='22023',message='invalid_clue_team';
  end if;
  if p_clue_id is null then
    insert into clues(title,content,group_name,team_scope,active,spy_guest_id,level)
    values(trim(p_title),trim(p_content),v_group,p_team_scope,true,null,1)
    returning id into v_id;
  else
    select * into v_existing from clues where id=p_clue_id for update;
    if not found then raise exception using errcode='P0002',message='clue_not_found'; end if;
    if exists(select 1 from guest_clues where clue_id=p_clue_id) and (
        v_existing.title is distinct from trim(p_title)
        or v_existing.content is distinct from trim(p_content)
        or v_existing.group_name is distinct from v_group
        or v_existing.team_scope is distinct from p_team_scope) then
      raise exception using errcode='P0001',message='granted_clue_content_locked';
    end if;
    update clues set title=trim(p_title),content=trim(p_content),group_name=v_group,
      team_scope=p_team_scope,active=true
    where id=p_clue_id returning id into v_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.save','clue',v_id::text,jsonb_build_object(
    'title',trim(p_title),'group_name',v_group,'team_scope',p_team_scope,'active',true));
  return v_id;
end;
$$;

create or replace function guard_granted_clue_content()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if current_setting('wedding.rehearsal_reset',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if exists(select 1 from guest_clues where clue_id=old.id) then
    if tg_op='DELETE' or new.title is distinct from old.title
        or new.content is distinct from old.content
        or new.group_name is distinct from old.group_name
        or new.team_scope is distinct from old.team_scope
        or new.spy_guest_id is distinct from old.spy_guest_id then
      raise exception using errcode='P0001',message='granted_clue_content_locked';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists guard_granted_clue_content on clues;
create trigger guard_granted_clue_content before update or delete on clues
for each row execute function guard_granted_clue_content();

-- Generic task editing remains useful for rehearsal drafts. It cannot mutate
-- the official catalog, revive the retired hidden-spy path, or create a task
-- that is assignable in the formal live catalog.
create or replace function save_game_task(
  p_task_id uuid,p_title text,p_description text,p_verification_method text,p_points integer,
  p_role_scope text,p_category text,p_stage text,p_active boolean,p_grants_hidden_spy boolean,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing tasks%rowtype;
begin
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null or length(trim(p_title))>120
      or nullif(trim(coalesce(p_description,'')),'') is null or length(trim(p_description))>1000
      or nullif(trim(coalesce(p_verification_method,'')),'') is null
      or length(trim(p_verification_method))>500 then
    raise exception using errcode='22023',message='task_content_required';
  end if;
  if p_points is null or p_points<0 or p_points>12 then raise exception using errcode='22023',message='invalid_task_points'; end if;
  if p_role_scope not in('all','guest','spy','helper') then raise exception using errcode='22023',message='invalid_role'; end if;
  if p_category not in('standard','ceremony','group','upgrade','hidden') then raise exception using errcode='22023',message='invalid_task_category'; end if;
  if p_stage not in('task_round_1','task_round_2','group_game') then raise exception using errcode='22023',message='invalid_game_stage'; end if;
  if coalesce(p_grants_hidden_spy,false) then raise exception using errcode='P0001',message='hidden_spy_feature_retired'; end if;
  if p_task_id is null then
    insert into tasks(title,description,verification_method,points,role_scope,category,stage,
      active,grants_hidden_spy,formal_allowed)
    values(trim(p_title),trim(p_description),trim(p_verification_method),p_points,p_role_scope,
      p_category,p_stage,p_active,false,false) returning id into v_id;
  else
    select * into v_existing from tasks where id=p_task_id for update;
    if not found then raise exception using errcode='P0002',message='task_not_found'; end if;
    if coalesce(v_existing.mission_code,'') ~* '^P[12]-' or v_existing.formal_allowed then
      raise exception using errcode='P0001',message='official_task_catalog_locked';
    end if;
    if exists(select 1 from assignments where task_id=p_task_id) and (
      v_existing.points is distinct from p_points or v_existing.role_scope is distinct from p_role_scope
      or v_existing.category is distinct from p_category or v_existing.stage is distinct from p_stage) then
      raise exception using errcode='P0001',message='task_rules_locked';
    end if;
    update tasks set title=trim(p_title),description=trim(p_description),
      verification_method=trim(p_verification_method),points=p_points,role_scope=p_role_scope,
      category=p_category,stage=p_stage,active=p_active,grants_hidden_spy=false,formal_allowed=false
    where id=p_task_id returning id into v_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'task.save','task',v_id::text,jsonb_build_object(
    'title',trim(p_title),'active',p_active,'formal_allowed',false));
  return v_id;
end;
$$;

create or replace function cast_team_vote(p_voter_guest_id uuid,p_target_guest_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_voter guests%rowtype; v_target guests%rowtype; v_weight integer:=1; v_state game_state%rowtype;
begin
  if p_voter_guest_id=p_target_guest_id then raise exception using errcode='22023',message='self_vote'; end if;
  select * into v_state from game_state where id=1 for share;
  if not coalesce(v_state.voting_open,false) then raise exception using errcode='P0001',message='voting_closed'; end if;
  select * into v_voter from guests where id=p_voter_guest_id for share;
  select * into v_target from guests where id=p_target_guest_id for share;
  if v_voter.id is null or v_target.id is null then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_voter.active or not v_voter.uses_app or v_voter.participation_mode<>'ACTIVE_PLAYER'
      or not v_voter.phase_two_eligible or v_voter.drawn_at is null
      or v_voter.team not in('海岛组','沙漠组') then
    raise exception using errcode='P0001',message='voter_not_competitive';
  end if;
  if not v_target.active or not v_target.uses_app or v_target.participation_mode<>'ACTIVE_PLAYER'
      or not v_target.phase_two_eligible or v_target.drawn_at is null
      or v_target.team not in('海岛组','沙漠组') then
    raise exception using errcode='P0001',message='target_not_competitive';
  end if;
  if v_voter.team<>v_target.team then raise exception using errcode='22023',message='cross_team_vote'; end if;
  if exists(select 1 from phase_two_profiles where guest_id=p_voter_guest_id
      and primary_mission='EXTRA_VOTE' and unlocked_at is not null)
      or exists(select 1 from assignments a join tasks t on t.id=a.task_id
        left join phase_two_profiles p on p.guest_id=a.guest_id
        where a.guest_id=p_voter_guest_id and a.status='approved'
          and v_voter.role='spy' and (
            t.mission_code='P2-TRICKSTER-001'
            or (t.mission_code='P1-TRICKSTER-001' and p.primary_mission='TRICKSTER'
              and p.unlocked_at is not null)
          )) then
    v_weight:=2;
  end if;
  begin
    insert into votes(voter_guest_id,target_guest_id,voting_round,vote_weight)
    values(p_voter_guest_id,p_target_guest_id,v_state.voting_round,v_weight);
  exception when unique_violation then raise exception using errcode='P0001',message='vote_already_cast'; end;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_voter_guest_id::text,'vote.cast','vote',p_voter_guest_id::text,
    jsonb_build_object('target_id',p_target_guest_id,'voting_round',v_state.voting_round,'vote_weight',v_weight));
end;
$$;

-- Team scoring has the same terminal boundary as personal scoring. Keep the
-- explicit zero score semantics and request idempotency from the current RPC.
create or replace function adjust_host_team_points(
  p_team text,p_amount integer,p_reason text,p_event_key uuid,p_actor text
) returns integer language plpgsql security definer set search_path=public as $$
declare v_existing team_points_ledger%rowtype; v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount is null or p_amount not between 0 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then raise exception using errcode='22023',message='score_reason_required'; end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;
  perform pg_advisory_xact_lock(hashtext('host-score:'||p_event_key::text));
  select * into v_existing from team_points_ledger where event_key=p_event_key;
  if found then
    if v_existing.team<>p_team or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then raise exception using errcode='P0001',message='score_event_conflict'; end if;
    select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
    return v_total;
  end if;
  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if (select team_clues_settled_at is not null from game_state where id=1) then
    raise exception using errcode='P0001',message='team_scores_already_settled';
  end if;
  insert into team_points_ledger(team,amount,reason,event_key,actor)
  values(p_team,p_amount,trim(p_reason),p_event_key,p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.team_points_add','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'event_key',p_event_key,
    'explicit_zero',p_amount=0));
  return v_total;
end;
$$;

-- Remove direct service-role access to legacy non-idempotent scoring RPCs.
revoke all on function adjust_guest_points(uuid,integer,text,text) from service_role;
revoke all on function adjust_team_points(text,integer,text,text) from service_role;

-- Retire every obsolete overload, not only the newest name. PostgREST exposes
-- overloads independently; leaving one service grant would bypass the current
-- official-catalog, clue-content and terminal-result guards.
revoke all on function create_game_task(text,text,integer,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function create_game_clue(text,text,text) from public,anon,authenticated,service_role;
revoke all on function save_game_clue(uuid,text,text,boolean,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function save_game_clue_v2(uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function save_alliance_clue_fragment(text,text,text,text,boolean,text) from public,anon,authenticated,service_role;

-- These three signatures were dropped by earlier canonical migrations, but a
-- drifted environment may still retain them. Revoke them only when present so
-- the forward migration is valid both on canonical and drifted databases.
do $retire_legacy_overloads$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.save_game_task(uuid,text,text,integer,text,text,text,boolean,text)',
    'public.save_game_task(uuid,text,text,integer,text,text,text,boolean,boolean,text)',
    'public.save_game_clue(uuid,text,text,boolean,text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute 'revoke all on function '||v_signature||' from public,anon,authenticated,service_role';
    end if;
  end loop;
end;
$retire_legacy_overloads$;

revoke all on function guard_retired_and_official_task_catalog() from public,anon,authenticated;
revoke all on function issue_hidden_task_code(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function redeem_hidden_task_code(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function approve_assignment(uuid,text,text) from public,anon,authenticated;
revoke all on function approve_assignment_with_verification(uuid,text,text) from public,anon,authenticated;
revoke all on function reject_assignment(uuid,text,text) from public,anon,authenticated;
revoke all on function set_game_flag(text,boolean,text) from public,anon,authenticated;
revoke all on function sync_completed_trickster_vote_weight() from public,anon,authenticated;
revoke all on function save_award(uuid,text,uuid,text,text,integer,boolean,text) from public,anon,authenticated;
revoke all on function deactivate_game_clue(uuid,text) from public,anon,authenticated;
revoke all on function save_game_clue_v3(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function guard_granted_clue_content() from public,anon,authenticated;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from public,anon,authenticated;
revoke all on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function cast_team_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function approve_assignment(uuid,text,text) to service_role;
grant execute on function approve_assignment_with_verification(uuid,text,text) to service_role;
grant execute on function reject_assignment(uuid,text,text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
grant execute on function save_award(uuid,text,uuid,text,text,integer,boolean,text) to service_role;
grant execute on function deactivate_game_clue(uuid,text) to service_role;
grant execute on function save_game_clue_v3(uuid,text,text,text,text,text) to service_role;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text) to service_role;
grant execute on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text) to service_role;
grant execute on function cast_team_vote(uuid,uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130011','finale.boundary_hardened','game_state','1',jsonb_build_object(
  'results_terminal',true,'staff_scoring_frozen',true,'assignment_review_frozen',true,
  'awards_frozen',true,'clue_grants_frozen',true,'hidden_spy_retired',true,
  'official_task_catalog_locked',true,'historical_votes_immutable',true));

commit;
