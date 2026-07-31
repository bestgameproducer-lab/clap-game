begin;

-- Team-game clues are released once the host opens the final vote. The same
-- deterministic clue set is copied to every eligible non-trickster teammate;
-- guest_clues' unique key keeps retries and reopened voting rounds idempotent.
create or replace function settle_phase_two_team_clues(p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team record;
  v_spy_id uuid;
  v_spy_count integer;
  v_clue_ids uuid[];
  v_clue_count integer;
  v_inserted integer;
  v_total_inserted integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-team-clues-v1'));

  if not exists(select 1 from team_points_ledger where team in ('海岛组','沙漠组')) then
    raise exception using errcode='P0001',message='phase_two_team_scores_missing';
  end if;

  for v_team in
    with totals as (
      select team,coalesce(sum(amount),0)::integer as score
      from team_points_ledger
      where team in ('海岛组','沙漠组')
      group by team
    ), complete_totals as (
      select expected.team,coalesce(totals.score,0)::integer as score
      from (values('海岛组'::text),('沙漠组'::text)) expected(team)
      left join totals using(team)
    )
    select team,score,dense_rank() over(order by score desc)::integer as team_rank
    from complete_totals
  loop
    v_clue_count:=case when v_team.team_rank=1 then 2 when v_team.team_rank=2 then 1 else 0 end;
    if v_clue_count=0 then continue; end if;

    select min(id),count(*)::integer into v_spy_id,v_spy_count
    from guests
    where active and drawn_at is not null and role='spy' and team=v_team.team;
    if v_spy_count<>1 then
      raise exception using errcode='P0001',message='phase_two_team_spy_missing';
    end if;

    select coalesce(array_agg(selected.id order by selected.priority,selected.level,selected.created_at,selected.id),'{}'::uuid[])
    into v_clue_ids
    from (
      select c.id,c.level,c.created_at,
        case when c.spy_guest_id=v_spy_id then 0 else 1 end as priority
      from clues c
      where c.active and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null)
      order by priority,c.level,c.created_at,c.id
      limit v_clue_count
    ) selected;

    if cardinality(v_clue_ids)<v_clue_count then
      raise exception using errcode='P0001',message='phase_two_team_clues_missing';
    end if;

    insert into guest_clues(guest_id,clue_id,granted_by)
    select g.id,selected_clue.id,p_actor
    from guests g
    cross join unnest(v_clue_ids) selected_clue(id)
    where g.active and g.drawn_at is not null and g.phase_two_eligible
      and g.eligible_for_secret_role and g.team=v_team.team and g.id<>v_spy_id
    on conflict(guest_id,clue_id) do nothing;
    get diagnostics v_inserted=row_count;
    v_total_inserted:=v_total_inserted+v_inserted;

    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.team_clues_settle','team',v_team.team,jsonb_build_object(
      'rank',v_team.team_rank,'team_score',v_team.score,'clue_count',v_clue_count,
      'recipient_clue_rows_created',v_inserted));
  end loop;

  return jsonb_build_object('recipient_clue_rows_created',v_total_inserted);
end;
$$;

-- Preserve the established stage, phase-one finalization, voting and result
-- settlement boundaries while adding the team-clue settlement atomically.
create or replace function set_game_flag(p_field text,p_value boolean,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  if p_field='voting_open' then
    if p_value and not v_state.voting_open then
      if v_state.stage not in ('group_game','voting','results') then
        raise exception using errcode='P0001',message='voting_stage_not_ready';
      end if;
      if not exists(select 1 from guests where active and drawn_at is not null) then
        raise exception using errcode='P0001',message='no_drawn_guests';
      end if;
      if v_state.phase_one_completed_at is null then
        perform finalize_phase_one_content(p_actor);
      end if;
      perform settle_phase_two_team_clues(p_actor);
      update game_state set
        registration_open=false,
        voting_open=true,
        results_visible=false,
        stage='voting',
        voting_round=voting_round+1,
        voting_opened_at=now(),
        voting_closed_at=null,
        results_published_at=null,
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
    elsif not p_value and v_state.voting_open then
      update game_state set voting_open=false,voting_closed_at=coalesce(voting_closed_at,now()),updated_at=now() where id=1;
    end if;
  elsif p_field='results_visible' then
    if p_value then
      if v_state.voting_round<1 then raise exception using errcode='P0001',message='voting_not_started'; end if;
      update game_state set
        voting_open=false,
        results_visible=true,
        stage='results',
        voting_closed_at=coalesce(voting_closed_at,now()),
        results_published_at=coalesce(results_published_at,now()),
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
      perform settle_voting_results(v_state.voting_round,p_actor);
      perform settle_spy_results(v_state.voting_round,p_actor);
    else
      update game_state set
        results_visible=false,
        stage=case when stage='results' then 'voting' else stage end,
        results_published_at=null,
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
    end if;
  elsif p_field='scoreboard_visible' then
    update game_state set scoreboard_visible=p_value,updated_at=now() where id=1;
  else
    raise exception using errcode='22023',message='invalid_game_flag';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.'||p_field,'game_state','1',jsonb_build_object(
    'value',p_value,
    'previous_stage',v_state.stage,
    'stage',(select stage from game_state where id=1),
    'voting_round',(select voting_round from game_state where id=1)
  ));
end;
$$;

revoke all on function settle_phase_two_team_clues(text) from public,anon,authenticated;
revoke all on function set_game_flag(text,boolean,text) from public,anon,authenticated;
grant execute on function settle_phase_two_team_clues(text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310007','phase_two.team_rank_clues','game_state','1',jsonb_build_object(
  'first_place_clues',2,'second_place_clues',1,'settlement_boundary','open_final_vote',
  'idempotent',true,'runtime_preserved',true));

commit;
