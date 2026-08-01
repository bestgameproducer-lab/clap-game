-- Make team-score settlement an explicit pre-vote step and target every clue
-- to one competitive team. Existing runtime data is preserved.

begin;

alter table game_state add column if not exists team_clues_settled_at timestamptz;

alter table clues add column if not exists team_scope text;
alter table clues drop constraint if exists clues_team_scope_check;
alter table clues add constraint clues_team_scope_check
  check (team_scope is null or team_scope in ('海岛组','沙漠组'));

update clues c set team_scope=g.team
from guests g
where c.spy_guest_id=g.id and c.team_scope is null and g.team in ('海岛组','沙漠组');

-- Remove only untouched seed placeholders. Already-issued rows are retained but
-- disabled so no guest history or foreign-key relationship is destroyed.
update clues set active=false
where title in ('示例线索一','示例线索二')
  and exists(select 1 from guest_clues gc where gc.clue_id=clues.id);
delete from clues
where title in ('示例线索一','示例线索二')
  and not exists(select 1 from guest_clues gc where gc.clue_id=clues.id);
delete from clues
where title='秘密线索' and trim(content)=''
  and not exists(select 1 from guest_clues gc where gc.clue_id=clues.id);

create or replace function save_game_clue_v3(
  p_clue_id uuid,p_title text,p_content text,p_group_name text,p_team_scope text,p_actor text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_group text:=trim(coalesce(p_group_name,''));
  v_existing clues%rowtype;
begin
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
    if v_existing.team_scope is distinct from p_team_scope
        and exists(select 1 from guest_clues where clue_id=p_clue_id) then
      raise exception using errcode='P0001',message='clue_rules_locked';
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
  if not exists(select 1 from team_points_ledger where team in ('海岛组','沙漠组')) then
    raise exception using errcode='P0001',message='phase_two_team_scores_missing';
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
    where g.active and g.drawn_at is not null and g.phase_two_eligible
      and g.eligible_for_secret_role and g.team=v_team.team and g.id<>v_spy_id
    on conflict(guest_id,clue_id) do nothing;
    get diagnostics v_inserted=row_count;
    v_total_inserted:=v_total_inserted+v_inserted;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'team',v_team.team,'rank',v_team.team_rank,'score',v_team.score,
      'clue_count',v_clue_count,'recipient_clue_rows_created',v_inserted));
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.team_clues_settle','team',v_team.team,v_result->-1);
  end loop;

  update game_state set team_clues_settled_at=now(),updated_at=now() where id=1;
  return jsonb_build_object('already_settled',false,'teams',v_result,
    'recipient_clue_rows_created',v_total_inserted);
end;
$$;

create or replace function set_game_flag(p_field text,p_value boolean,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if p_field='voting_open' then
    if p_value and not v_state.voting_open then
      if v_state.stage not in ('group_game','voting','results') then raise exception using errcode='P0001',message='voting_stage_not_ready'; end if;
      if v_state.team_clues_settled_at is null then raise exception using errcode='P0001',message='team_clues_not_settled'; end if;
      if not exists(select 1 from guests where active and drawn_at is not null) then raise exception using errcode='P0001',message='no_drawn_guests'; end if;
      if v_state.phase_one_completed_at is null then perform finalize_phase_one_content(p_actor); end if;
      update game_state set registration_open=false,voting_open=true,results_visible=false,stage='voting',
        voting_round=voting_round+1,voting_opened_at=now(),voting_closed_at=null,results_published_at=null,
        current_host_segment_id=null,display_title=null,display_body=null,public_clue=null,timer_ends_at=null,updated_at=now()
      where id=1;
    elsif not p_value and v_state.voting_open then
      update game_state set voting_open=false,voting_closed_at=coalesce(voting_closed_at,now()),updated_at=now() where id=1;
    end if;
  elsif p_field='results_visible' then
    if p_value then
      if v_state.voting_round<1 then raise exception using errcode='P0001',message='voting_not_started'; end if;
      update game_state set voting_open=false,results_visible=true,stage='results',
        voting_closed_at=coalesce(voting_closed_at,now()),results_published_at=coalesce(results_published_at,now()),
        current_host_segment_id=null,display_title=null,display_body=null,public_clue=null,timer_ends_at=null,updated_at=now()
      where id=1;
      perform settle_voting_results(v_state.voting_round,p_actor);
      perform settle_spy_results(v_state.voting_round,p_actor);
    else
      update game_state set results_visible=false,stage=case when stage='results' then 'voting' else stage end,
        results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
        public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
    end if;
  elsif p_field='scoreboard_visible' then
    update game_state set scoreboard_visible=p_value,updated_at=now() where id=1;
  else raise exception using errcode='22023',message='invalid_game_flag';
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.'||p_field,'game_state','1',jsonb_build_object(
    'value',p_value,'previous_stage',v_state.stage,'stage',(select stage from game_state where id=1),
    'voting_round',(select voting_round from game_state where id=1)));
end;
$$;

-- Manual team scoring closes at the explicit settlement boundary. Final voting
-- rewards use their own idempotent settlement functions and remain unaffected.
create or replace function adjust_team_points(p_team text,p_amount integer,p_actor text,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer;
begin
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount=0 or abs(p_amount)>1000 then raise exception using errcode='22023',message='invalid_point_amount'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>200 then raise exception using errcode='22023',message='reason_required'; end if;
  perform 1 from game_state where id=1 for update;
  if (select team_clues_settled_at is not null from game_state where id=1) then
    raise exception using errcode='P0001',message='team_scores_already_settled';
  end if;
  insert into team_points_ledger(team,amount,reason,actor) values(p_team,p_amount,trim(p_reason),p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'team.points_adjust','team',p_team,jsonb_build_object('amount',p_amount,'total',v_total,'reason',trim(p_reason)));
  return v_total;
end;
$$;

create or replace function adjust_host_team_points(
  p_team text,p_amount integer,p_reason text,p_event_key uuid,p_actor text
) returns integer language plpgsql security definer set search_path=public as $$
declare v_existing team_points_ledger%rowtype; v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount not between 1 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
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
  if (select team_clues_settled_at is not null from game_state where id=1) then
    raise exception using errcode='P0001',message='team_scores_already_settled';
  end if;
  insert into team_points_ledger(team,amount,reason,event_key,actor)
  values(p_team,p_amount,trim(p_reason),p_event_key,p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.team_points_add','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'event_key',p_event_key));
  return v_total;
end;
$$;

create or replace function reset_team_clue_settlement_after_rehearsal()
returns trigger language plpgsql security definer set search_path=public as $$
begin update game_state set team_clues_settled_at=null where id=1; return new; end;
$$;
drop trigger if exists rehearsal_reset_team_clue_settlement on rehearsal_resets;
create trigger rehearsal_reset_team_clue_settlement after insert on rehearsal_resets
for each row execute function reset_team_clue_settlement_after_rehearsal();

revoke all on function save_game_clue_v3(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function settle_phase_two_team_clues(text) from public,anon,authenticated;
revoke all on function set_game_flag(text,boolean,text) from public,anon,authenticated;
revoke all on function adjust_team_points(text,integer,text,text) from public,anon,authenticated;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from public,anon,authenticated;
revoke all on function reset_team_clue_settlement_after_rehearsal() from public,anon,authenticated;
grant execute on function save_game_clue_v3(uuid,text,text,text,text,text) to service_role;
grant execute on function settle_phase_two_team_clues(text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
grant execute on function adjust_team_points(text,integer,text,text) to service_role;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310032','phase_two.explicit_team_clue_settlement','game_state','1',jsonb_build_object(
  'runtime_preserved',true,'team_scoped_clues',true,'settlement_boundary','before_final_vote',
  'example_placeholders_removed',true));

commit;
