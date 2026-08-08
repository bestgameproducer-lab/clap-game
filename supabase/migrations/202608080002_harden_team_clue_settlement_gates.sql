-- Enforce every documented pre-vote gate inside the settlement transaction.
-- UI disabled states are guidance only and must not be the security boundary.

begin;

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
  if v_state.stage<>'group_game' then
    raise exception using errcode='P0001',message='team_clue_settlement_stage_not_ready';
  end if;
  if v_state.team_clues_settled_at is not null then
    return jsonb_build_object('already_settled',true,'settled_at',v_state.team_clues_settled_at);
  end if;
  if exists(
    select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where (select count(*) from guests where active and drawn_at is not null
      and phase_two_eligible and team=expected.team)<>10
  ) then
    raise exception using errcode='P0001',message='phase_two_team_draws_incomplete';
  end if;
  if exists(
    select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where not exists(select 1 from team_points_ledger ledger where ledger.team=expected.team)
  ) then
    raise exception using errcode='P0001',message='phase_two_team_scores_missing';
  end if;
  if exists(
    select 1 from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where (select count(*) from clues where active and team_scope=expected.team)<2
  ) then
    raise exception using errcode='P0001',message='phase_two_team_clues_missing';
  end if;

  for v_team in
    with totals as (
      select team,coalesce(sum(amount),0)::integer score from team_points_ledger
      where team in ('海岛组','沙漠组') group by team
    ), complete_totals as (
      select expected.team,coalesce(totals.score,0)::integer score
      from (values('海岛组'::text),('沙漠组'::text)) expected(team) left join totals using(team)
    )
    select team,score,dense_rank() over(order by score desc)::integer team_rank from complete_totals
  loop
    v_clue_count:=case when v_team.team_rank=1 then 2 when v_team.team_rank=2 then 1 else 0 end;
    select min(id),count(*)::integer into v_spy_id,v_spy_count from guests
    where active and drawn_at is not null and role='spy' and team=v_team.team;
    if v_spy_count<>1 then raise exception using errcode='P0001',message='phase_two_team_spy_missing'; end if;

    select coalesce(array_agg(selected.id order by selected.priority,selected.level,selected.created_at,selected.id),'{}'::uuid[])
    into v_clue_ids from (
      select c.id,c.level,c.created_at,case when c.spy_guest_id=v_spy_id then 0 else 1 end priority
      from clues c where c.active and c.team_scope=v_team.team
        and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null)
      order by priority,c.level,c.created_at,c.id limit v_clue_count
    ) selected;
    if cardinality(v_clue_ids)<v_clue_count then
      raise exception using errcode='P0001',message='phase_two_team_clues_missing';
    end if;

    insert into guest_clues(guest_id,clue_id,granted_by)
    select g.id,selected.id,p_actor from guests g cross join unnest(v_clue_ids) selected(id)
    where g.active and g.drawn_at is not null and g.phase_two_eligible and g.team=v_team.team
    on conflict(guest_id,clue_id) do nothing;
    get diagnostics v_inserted=row_count;
    v_total_inserted:=v_total_inserted+v_inserted;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'team',v_team.team,'rank',v_team.team_rank,'score',v_team.score,
      'clue_count',v_clue_count,'recipient_clue_rows_created',v_inserted));
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.team_clues_settle','team',v_team.team,v_result->-1);
  end loop;

  update game_state set team_clues_settled_at=now(),
    team_score_snapshot=(select jsonb_object_agg(expected.team,coalesce(t.total,0))
      from (values('海岛组'::text),('沙漠组'::text)) expected(team)
      left join (select team,sum(amount)::integer total from team_points_ledger
        where team in('海岛组','沙漠组') group by team) t using(team)),
    updated_at=now() where id=1;
  return jsonb_build_object('already_settled',false,'teams',v_result,
    'recipient_clue_rows_created',v_total_inserted);
end;
$$;

revoke all on function settle_phase_two_team_clues(text) from public,anon,authenticated;
grant execute on function settle_phase_two_team_clues(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608080002','phase_two.team_settlement_gates','game_state','1',jsonb_build_object(
  'requires_ten_draws_per_team',true,'requires_score_entry_per_team',true,
  'requires_two_active_clues_per_team',true,'team_snapshot_unchanged_after_settlement',true));

commit;
