-- Make staff corrections safe to retry on unreliable venue networks, keep
-- personal and team ledgers separate, and prevent cross-team clue grants.

begin;

-- An explicit zero is a real score record: it proves that a team result was
-- entered before settlement. The original table check still rejected zero
-- even after the scoring RPC began accepting it.
alter table team_points_ledger drop constraint if exists team_points_ledger_amount_check;
alter table team_points_ledger add constraint team_points_ledger_amount_check
  check (abs(amount) <= 1000);

create or replace function adjust_staff_guest_points(
  p_guest_id uuid,
  p_amount integer,
  p_actor text,
  p_reason text,
  p_event_key uuid
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing points_ledger%rowtype;
  v_guest guests%rowtype;
  v_after integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_amount is null or p_amount=0 or abs(p_amount)>1000 then raise exception using errcode='22023',message='invalid_point_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('staff-score:'||p_event_key::text));
  select * into v_existing from points_ledger where event_key=p_event_key;
  if found then
    if v_existing.guest_id<>p_guest_id or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
    select points into v_after from guests where id=p_guest_id;
    return v_after;
  end if;

  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;

  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app or not v_guest.eligible_for_personal_score then
    raise exception using errcode='P0001',message='guest_not_personal_score_eligible';
  end if;

  v_after:=v_guest.points+p_amount;
  if v_after<0 then raise exception using errcode='P0001',message='point_total_below_zero'; end if;

  update guests set points=v_after where id=p_guest_id;
  insert into points_ledger(guest_id,amount,reason,event_key,actor)
  values(p_guest_id,p_amount,trim(p_reason),p_event_key,p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.points_adjust','guest',p_guest_id::text,jsonb_build_object(
    'amount',p_amount,'before',v_guest.points,'after',v_after,
    'reason',trim(p_reason),'event_key',p_event_key));
  return v_after;
end;
$$;

create or replace function adjust_staff_team_points(
  p_team text,
  p_amount integer,
  p_actor text,
  p_reason text,
  p_event_key uuid
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing team_points_ledger%rowtype;
  v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount is null or abs(p_amount)>1000 then raise exception using errcode='22023',message='invalid_point_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('staff-score:'||p_event_key::text));
  select * into v_existing from team_points_ledger where event_key=p_event_key;
  if found then
    if v_existing.team<>p_team or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
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
  values(p_actor,'team.points_adjust','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'event_key',p_event_key,
    'explicit_zero',p_amount=0));
  return v_total;
end;
$$;

-- Freeze the public final ranking. Host personal bonuses are still retry-safe,
-- but a new event cannot change points after results have been published.
create or replace function adjust_host_guest_points(
  p_guest_id uuid,
  p_amount integer,
  p_reason text,
  p_event_key uuid,
  p_actor text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing points_ledger%rowtype;
  v_guest guests%rowtype;
  v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_amount is null or p_amount not between 1 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='score_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('host-score:'||p_event_key::text));
  select * into v_existing from points_ledger where event_key=p_event_key;
  if found then
    if v_existing.guest_id<>p_guest_id or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
    select points into v_total from guests where id=p_guest_id;
    return v_total;
  end if;

  perform 1 from game_state where id=1 for update;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app or not v_guest.eligible_for_personal_score then
    raise exception using errcode='P0001',message='guest_not_personal_score_eligible';
  end if;

  v_total:=v_guest.points+p_amount;
  update guests set points=v_total where id=p_guest_id;
  insert into points_ledger(guest_id,amount,reason,event_key,actor)
  values(p_guest_id,p_amount,trim(p_reason),p_event_key,p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.guest_points_add','guest',p_guest_id::text,jsonb_build_object(
    'amount',p_amount,'before',v_guest.points,'after',v_total,
    'reason',trim(p_reason),'event_key',p_event_key));
  return v_total;
end;
$$;

create or replace function grant_guest_clue(p_guest_id uuid,p_clue_id uuid,p_actor text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_grant_id uuid;
  v_guest guests%rowtype;
  v_clue clues%rowtype;
begin
  perform 1 from game_state where id=1 for update;
  if not coalesce((select team_clues_settled_at is not null from game_state where id=1),false) then
    raise exception using errcode='P0001',message='team_clues_not_settled';
  end if;
  if coalesce((select results_published_at is not null from game_state where id=1),false)
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  select * into v_guest from guests where id=p_guest_id;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  select * into v_clue from clues where id=p_clue_id and active;
  if not found then raise exception using errcode='P0002',message='clue_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app or not v_guest.phase_two_eligible
      or v_guest.participation_mode<>'ACTIVE_PLAYER' or v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='guest_not_secret_clue_eligible';
  end if;
  if v_guest.team not in ('海岛组','沙漠组') or v_clue.team_scope is distinct from v_guest.team then
    raise exception using errcode='P0001',message='clue_team_mismatch';
  end if;
  insert into guest_clues(guest_id,clue_id,granted_by)
  values(p_guest_id,p_clue_id,p_actor)
  on conflict(guest_id,clue_id) do nothing
  returning id into v_grant_id;
  if v_grant_id is null then raise exception using errcode='23505',message='clue_already_granted'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.grant','guest_clue',v_grant_id::text,jsonb_build_object(
    'guest_id',p_guest_id,'clue_id',p_clue_id,'team',v_guest.team));
  return v_grant_id;
end;
$$;

-- Use one exact competitive-player predicate for readiness, spy lookup and
-- recipients. Clue readiness also counts only clues the same selection query
-- can actually choose for that team's current trickster.
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
  v_result jsonb:='[]'::jsonb;
begin
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
    -- PostgreSQL has no built-in min(uuid) aggregate on the production
    -- version. Select the only expected spy deterministically from the UUID
    -- array while retaining the exact-count invariant.
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
    v_result:=v_result||jsonb_build_array(jsonb_build_object('team',v_team.team,
      'rank',v_team.team_rank,'score',v_team.score,'clue_count',v_clue_count,
      'recipient_clue_rows_created',v_inserted));
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.team_clues_settle','team',v_team.team,v_result->-1);
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

revoke all on function adjust_staff_guest_points(uuid,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function adjust_staff_team_points(text,integer,text,text,uuid) from public,anon,authenticated;
revoke all on function adjust_host_guest_points(uuid,integer,text,uuid,text) from public,anon,authenticated;
revoke all on function grant_guest_clue(uuid,uuid,text) from public,anon,authenticated;
revoke all on function settle_phase_two_team_clues(text) from public,anon,authenticated;
grant execute on function adjust_staff_guest_points(uuid,integer,text,text,uuid) to service_role;
grant execute on function adjust_staff_team_points(text,integer,text,text,uuid) to service_role;
grant execute on function adjust_host_guest_points(uuid,integer,text,uuid,text) to service_role;
grant execute on function grant_guest_clue(uuid,uuid,text) to service_role;
grant execute on function settle_phase_two_team_clues(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130010','staff.operations_hardened','game_state','1',jsonb_build_object(
  'personal_score_idempotent',true,'team_score_idempotent',true,'cross_team_clues_blocked',true));

commit;
