-- Keep manual stage changes, voting rounds, result settlement, and the public display coherent.
create or replace function set_game_stage(p_stage text, p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then
    raise exception using errcode='P0001',message='use_voting_controls';
  end if;

  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  update game_state set
    stage=p_stage,
    voting_open=false,
    results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,
    current_host_segment_id=null,
    display_title=null,
    display_body=null,
    public_clue=null,
    timer_ends_at=null,
    updated_at=now()
  where id=1;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',
    jsonb_build_object('previous_stage',v_state.stage,'stage',p_stage,'public_display_cleared',true));
end;
$$;

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

create or replace function set_registration_open(p_value boolean,p_actor text)
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
  if p_value and (v_state.voting_open or v_state.results_visible or v_state.stage in ('voting','results')) then
    raise exception using errcode='P0001',message='registration_during_finale';
  end if;
  update game_state set registration_open=p_value,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.registration_open','game_state','1',jsonb_build_object('value',p_value,'stage',v_state.stage));
end;
$$;

revoke all on function set_game_stage(text,text) from public,anon,authenticated;
revoke all on function set_game_flag(text,boolean,text) from public,anon,authenticated;
revoke all on function set_registration_open(boolean,text) from public,anon,authenticated;
grant execute on function set_game_stage(text,text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
grant execute on function set_registration_open(boolean,text) to service_role;
