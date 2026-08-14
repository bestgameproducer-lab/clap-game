-- In the live wedding catalogue, operators may only recover clues selected by
-- this rehearsal's team settlement. Draft/custom task tools remain available
-- in demo mode, but cannot mutate or create assignments during the live game.

begin;

create or replace function grant_guest_clue(p_guest_id uuid,p_clue_id uuid,p_actor text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_grant_id uuid;
  v_guest guests%rowtype;
  v_clue clues%rowtype;
  v_settled_clue_ids jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.team_clues_settled_at is null then
    raise exception using errcode='P0001',message='team_clues_not_settled';
  end if;
  if v_state.results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select * into v_guest from guests where id=p_guest_id for share;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  select * into v_clue from clues where id=p_clue_id and active for share;
  if not found then raise exception using errcode='P0002',message='clue_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app or not v_guest.phase_two_eligible
      or v_guest.participation_mode<>'ACTIVE_PLAYER' or v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='guest_not_secret_clue_eligible';
  end if;
  if v_guest.team not in ('海岛组','沙漠组') or v_clue.team_scope is distinct from v_guest.team then
    raise exception using errcode='P0001',message='clue_team_mismatch';
  end if;
  if v_clue.spy_guest_id is not null and (
    (select count(*) from guests spy
      where spy.active and spy.uses_app
        and spy.participation_mode='ACTIVE_PLAYER' and spy.phase_two_eligible
        and spy.drawn_at is not null and spy.role='spy' and not spy.is_hidden_spy
        and spy.team=v_guest.team)<>1
    or not exists(
      select 1 from guests spy
      where spy.id=v_clue.spy_guest_id and spy.active and spy.uses_app
        and spy.participation_mode='ACTIVE_PLAYER' and spy.phase_two_eligible
        and spy.drawn_at is not null and spy.role='spy' and not spy.is_hidden_spy
        and spy.team=v_guest.team
    )
  ) then
    raise exception using errcode='P0001',message='clue_spy_mismatch';
  end if;

  -- The settlement audit is immutable and stores the exact selected clue ids.
  -- Restrict recovery to the latest team settlement after the latest reset;
  -- merely creating another same-team clue can never make it grantable.
  select a.details->'clue_ids' into v_settled_clue_ids
  from audit_log a
  where a.action='phase_two.team_clues_settle'
    and a.details->>'team'=v_guest.team
    and a.created_at>coalesce(
      (select max(r.created_at) from audit_log r where r.action='rehearsal.reset'),
      '-infinity'::timestamptz
    )
  order by a.created_at desc,a.id desc
  limit 1;
  if not (coalesce(v_settled_clue_ids,'[]'::jsonb) ? p_clue_id::text) then
    raise exception using errcode='P0001',message='clue_not_earned_in_current_rehearsal';
  end if;

  insert into guest_clues(guest_id,clue_id,granted_by)
  values(p_guest_id,p_clue_id,p_actor)
  on conflict(guest_id,clue_id) do nothing
  returning id into v_grant_id;
  if v_grant_id is null then
    raise exception using errcode='23505',message='clue_already_granted';
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.grant','guest_clue',v_grant_id::text,jsonb_build_object(
    'guest_id',p_guest_id,'clue_id',p_clue_id,'team',v_guest.team,
    'recovery_only',true,'rehearsal_run_id',v_state.rehearsal_run_id));
  return v_grant_id;
end;
$$;

-- Persist the exact chosen ids, not just their count. Recovery authorization
-- below deliberately trusts this immutable settlement receipt rather than the
-- mutable clue library or pre-existing guest_clues rows.
create or replace function settle_phase_two_team_clues(p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_state game_state%rowtype;
  v_team record;
  v_spy_id uuid;
  v_spy_count integer;
  v_clue_ids uuid[];
  v_clue_count integer;
  v_inserted integer;
  v_total_inserted integer:=0;
  v_team_result jsonb;
  v_result jsonb:='[]'::jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-team-clues-v2'));
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.stage<>'group_game' then raise exception using errcode='P0001',message='team_clue_settlement_stage_not_ready'; end if;
  if v_state.team_clues_settled_at is not null then
    return jsonb_build_object('already_settled',true,'settled_at',v_state.team_clues_settled_at);
  end if;
  if exists(select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where (select count(*) from guests where active and uses_app
      and participation_mode='ACTIVE_PLAYER' and phase_two_eligible and drawn_at is not null
      and team=expected.team)<>10) then
    raise exception using errcode='P0001',message='phase_two_team_draws_incomplete';
  end if;
  if exists(select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where not exists(select 1 from team_points_ledger l where l.team=expected.team)) then
    raise exception using errcode='P0001',message='phase_two_team_scores_missing';
  end if;

  for v_team in
    with totals as(select team,coalesce(sum(amount),0)::integer score from team_points_ledger
      where team in('海岛组','沙漠组') group by team), complete_totals as(
      select expected.team,coalesce(t.score,0)::integer score
      from (values('海岛组'::text),('沙漠组'::text)) expected(team) left join totals t using(team))
    select team,score,dense_rank() over(order by score desc)::integer team_rank from complete_totals
  loop
    v_clue_count:=case when v_team.team_rank=1 then 2 else 1 end;
    select (array_agg(id order by id))[1],count(*)::integer into v_spy_id,v_spy_count from guests
    where active and uses_app and participation_mode='ACTIVE_PLAYER' and phase_two_eligible
      and drawn_at is not null and role='spy' and not is_hidden_spy and team=v_team.team;
    if v_spy_count<>1 then raise exception using errcode='P0001',message='phase_two_team_spy_missing'; end if;
    if (select count(*) from clues c where c.active and c.team_scope=v_team.team
        and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null))<v_clue_count then
      raise exception using errcode='P0001',message='phase_two_team_clues_missing';
    end if;
    select coalesce(array_agg(s.id order by s.priority,s.level,s.created_at,s.id),'{}'::uuid[])
    into v_clue_ids from(select c.id,c.level,c.created_at,
      case when c.spy_guest_id=v_spy_id then 0 else 1 end priority
      from clues c where c.active and c.team_scope=v_team.team
        and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null)
      order by priority,c.level,c.created_at,c.id limit v_clue_count) s;
    insert into guest_clues(guest_id,clue_id,granted_by)
    select g.id,selected.id,p_actor from guests g cross join unnest(v_clue_ids) selected(id)
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and g.team=v_team.team
    on conflict(guest_id,clue_id) do nothing;
    get diagnostics v_inserted=row_count;
    v_total_inserted:=v_total_inserted+v_inserted;
    v_team_result:=jsonb_build_object(
      'team',v_team.team,'rank',v_team.team_rank,'score',v_team.score,
      'clue_count',v_clue_count,'clue_ids',to_jsonb(v_clue_ids),
      'recipient_clue_rows_created',v_inserted
    );
    v_result:=v_result||jsonb_build_array(v_team_result);
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.team_clues_settle','team',v_team.team,v_team_result);
  end loop;
  update game_state set team_clues_settled_at=now(),
    team_score_snapshot=(select jsonb_object_agg(expected.team,coalesce(t.total,0))
      from (values('海岛组'::text),('沙漠组'::text)) expected(team)
      left join(select team,sum(amount)::integer total from team_points_ledger
        where team in('海岛组','沙漠组') group by team)t using(team)),updated_at=now() where id=1;
  return jsonb_build_object('already_settled',false,'teams',v_result,
    'recipient_clue_rows_created',v_total_inserted);
end;
$$;

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
  v_state game_state%rowtype;
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
  if not found or not v_task.active then
    raise exception using errcode='P0002',message='task_not_found';
  end if;
  if v_task.mission_code is not null or v_task.formal_allowed
      or coalesce(v_task.mission_code,'') ~* '^P[12]-' then
    raise exception using errcode='P0001',message='official_task_manual_assignment_forbidden';
  end if;

  select * into v_state from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.task_catalog_mode='live' then
    raise exception using errcode='P0001',message='live_custom_task_assignment_forbidden';
  end if;
  if v_task.role_scope not in('all',v_guest.role)
      or v_task.story_role_scope not in('NONE',v_guest.story_role) then
    raise exception using errcode='P0001',message='manual_task_role_ineligible';
  end if;
  if v_task.stage='task_round_1' and not phase_one_interactions_open(v_state.stage) then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='task_round_2' and v_state.stage not in('task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='group_game' and v_state.stage<>'group_game' then
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

-- Defence in depth for any future service-role path that bypasses the RPCs.
create or replace function guard_live_custom_task_catalog()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select task_catalog_mode from game_state where id=1)='live'
      and new.mission_code is null then
    raise exception using errcode='P0001',message='live_custom_task_catalog_locked';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_live_custom_task_catalog on tasks;
create trigger guard_live_custom_task_catalog
before insert or update on tasks
for each row execute function guard_live_custom_task_catalog();

create or replace function guard_live_custom_task_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select task_catalog_mode from game_state where id=1)='live'
      and exists(select 1 from tasks t where t.id=new.task_id and t.mission_code is null) then
    raise exception using errcode='P0001',message='live_custom_task_assignment_forbidden';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_live_custom_task_assignment on assignments;
create trigger guard_live_custom_task_assignment
before insert or update of task_id on assignments
for each row execute function guard_live_custom_task_assignment();

-- Keep the demo editor, but make live mode fail closed at the authoritative
-- function even if an outdated browser still submits the form.
alter function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text)
  rename to save_game_task_before_live_catalog_lock;
revoke all on function save_game_task_before_live_catalog_lock(uuid,text,text,text,integer,text,text,text,boolean,boolean,text)
  from public,anon,authenticated,service_role;

create function save_game_task(
  p_task_id uuid,p_title text,p_description text,p_verification_method text,p_points integer,
  p_role_scope text,p_category text,p_stage text,p_active boolean,p_grants_hidden_spy boolean,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_mode text; v_id uuid;
begin
  select task_catalog_mode into v_mode from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_mode='live' then
    raise exception using errcode='P0001',message='live_custom_task_catalog_locked';
  end if;
  v_id:=save_game_task_before_live_catalog_lock(
    p_task_id,p_title,p_description,p_verification_method,p_points,p_role_scope,
    p_category,p_stage,p_active,p_grants_hidden_spy,p_actor
  );
  -- Demo-created tasks must remain visible in the demo catalogue.
  update tasks set is_demo=true where id=v_id and mission_code is null;
  return v_id;
end;
$$;

revoke all on function grant_guest_clue(uuid,uuid,text) from public,anon,authenticated;
revoke all on function validate_manual_task_assignment(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function guard_live_custom_task_catalog() from public,anon,authenticated;
revoke all on function guard_live_custom_task_assignment() from public,anon,authenticated;
revoke all on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text)
  from public,anon,authenticated;
grant execute on function grant_guest_clue(uuid,uuid,text) to service_role;
grant execute on function save_game_task(uuid,text,text,text,integer,text,text,text,boolean,boolean,text)
  to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130019','manual_content.live_boundary_hardened','game_state','1',jsonb_build_object(
  'manual_clues','current_rehearsal_settlement_only',
  'live_custom_task_catalog_locked',true,
  'live_custom_task_assignment_locked',true,
  'demo_custom_tasks_preserved',true,
  'final_result_lock_preserved',true
));

commit;
