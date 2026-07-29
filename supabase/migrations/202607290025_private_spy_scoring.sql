-- Keep the adversarial score private until the final reveal. These points must not
-- affect the public guest/team leaderboards while the game is in progress.
create table if not exists spy_points_ledger (
  id bigint generated always as identity primary key,
  guest_id uuid not null references guests(id) on delete restrict,
  amount integer not null check (amount between 1 and 10),
  reason text not null check (reason in (
    'team_wrong_answer',
    'resource_wasted',
    'ordinary_guest_suspected',
    'escaped_vote',
    'team_first',
    'all_spy_tasks_complete'
  )),
  note text not null default '' check (char_length(note) <= 300),
  source_key text not null unique check (char_length(source_key) between 8 and 120),
  actor text not null check (char_length(actor) between 1 and 200),
  voting_round integer,
  created_at timestamptz not null default now()
);

create index if not exists spy_points_ledger_guest_created_idx
on spy_points_ledger (guest_id, created_at desc);

alter table spy_points_ledger enable row level security;
revoke all on spy_points_ledger from public, anon, authenticated;

create or replace function record_spy_point_event(
  p_guest_id uuid,
  p_reason text,
  p_note text,
  p_event_key uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest guests%rowtype;
  v_inserted_id bigint;
begin
  if p_reason not in ('team_wrong_answer','resource_wasted','ordinary_guest_suspected') then
    raise exception using errcode='22023', message='invalid_spy_point_reason';
  end if;
  if p_event_key is null then raise exception using errcode='22023', message='spy_event_key_required'; end if;
  if char_length(trim(coalesce(p_note,''))) > 300 then raise exception using errcode='22023', message='spy_note_too_long'; end if;
  if coalesce((select results_visible from game_state where id=1),false)
    or exists(select 1 from spy_points_ledger where source_key like 'final:%') then
    raise exception using errcode='P0001', message='spy_scoring_closed';
  end if;

  select * into v_guest from guests where id=p_guest_id and active for share;
  if not found then raise exception using errcode='P0002', message='guest_not_found'; end if;
  if v_guest.drawn_at is null or v_guest.role<>'spy' then
    raise exception using errcode='P0001', message='guest_not_active_spy';
  end if;

  insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor)
  values (p_guest_id,1,p_reason,trim(coalesce(p_note,'')),'manual:' || p_event_key::text,p_actor)
  on conflict (source_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    insert into audit_log(actor,action,target_type,target_id,details)
    values (p_actor,'spy_points.record','guest',p_guest_id::text,
      jsonb_build_object('reason',p_reason,'amount',1,'note',trim(coalesce(p_note,''))));
  end if;
end;
$$;

create or replace function settle_spy_results(p_voting_round integer, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spy record;
  v_top_team_score integer;
  v_reward_id bigint;
  v_escaped integer := 0;
  v_first_team integer := 0;
  v_tasks_complete integer := 0;
begin
  if p_voting_round < 1 then raise exception using errcode='22023', message='voting_not_started'; end if;
  perform pg_advisory_xact_lock(hashtext('wedding-spy-final-settlement-v1'));

  select max(team_score) into v_top_team_score
  from (
    select g.team,
      coalesce(sum(g.points),0)::integer
      + coalesce((select sum(t.amount) from team_points_ledger t where t.team=g.team),0)::integer as team_score
    from guests g
    where g.active and g.drawn_at is not null
    group by g.team
  ) totals;

  for v_spy in
    select g.id,g.team,
      (select count(*)::integer from votes v where v.voting_round=p_voting_round and v.target_guest_id=g.id) as spy_votes,
      (select count(*)::integer from votes v join guests voter on voter.id=v.voter_guest_id
        where v.voting_round=p_voting_round and voter.team=g.team) as team_votes,
      coalesce((select max(candidate_votes) from (
        select count(*)::integer as candidate_votes
        from votes v join guests target on target.id=v.target_guest_id
        where v.voting_round=p_voting_round and target.team=g.team
        group by v.target_guest_id
      ) vote_totals),0) as top_votes,
      (coalesce((select sum(member.points) from guests member where member.active and member.drawn_at is not null and member.team=g.team),0)
        + coalesce((select sum(t.amount) from team_points_ledger t where t.team=g.team),0))::integer as team_score,
      (select count(*)::integer from assignments a join tasks task on task.id=a.task_id
        where a.guest_id=g.id and task.role_scope='spy') as spy_task_count,
      (select count(*)::integer from assignments a join tasks task on task.id=a.task_id
        where a.guest_id=g.id and task.role_scope='spy' and a.status='approved') as approved_spy_task_count
    from guests g
    where g.active and g.drawn_at is not null and g.role='spy'
  loop
    -- With no ballots the spy escaped. A tie for the highest vote count is treated
    -- conservatively as being identified, so it earns no escape reward.
    if v_spy.team_votes=0 or v_spy.spy_votes<v_spy.top_votes then
      v_reward_id := null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values (v_spy.id,3,'escaped_vote','未成为本队最高票目标','final:escaped_vote:' || v_spy.id::text,p_actor,p_voting_round)
      on conflict (source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_escaped := v_escaped + 1; end if;
    end if;

    if v_top_team_score is not null and v_top_team_score>0 and v_spy.team_score=v_top_team_score then
      v_reward_id := null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values (v_spy.id,2,'team_first','所在队伍获得积分榜第一名','final:team_first:' || v_spy.id::text,p_actor,p_voting_round)
      on conflict (source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_first_team := v_first_team + 1; end if;
    end if;

    if v_spy.spy_task_count>0 and v_spy.approved_spy_task_count=v_spy.spy_task_count then
      v_reward_id := null;
      insert into spy_points_ledger(guest_id,amount,reason,note,source_key,actor,voting_round)
      values (v_spy.id,2,'all_spy_tasks_complete','全部已领取的间谍专属任务审核通过','final:all_spy_tasks_complete:' || v_spy.id::text,p_actor,p_voting_round)
      on conflict (source_key) do nothing returning id into v_reward_id;
      if v_reward_id is not null then v_tasks_complete := v_tasks_complete + 1; end if;
    end if;
  end loop;

  insert into audit_log(actor,action,target_type,target_id,details)
  values (p_actor,'spy_points.settle','voting_round',p_voting_round::text,
    jsonb_build_object('escaped_vote_rewards',v_escaped,'team_first_rewards',v_first_team,
      'all_spy_tasks_complete_rewards',v_tasks_complete));
  return jsonb_build_object('escaped_vote_rewards',v_escaped,'team_first_rewards',v_first_team,
    'all_spy_tasks_complete_rewards',v_tasks_complete);
end;
$$;

-- Extend the established atomic reveal boundary: publishing results now settles
-- both the public detective rewards and the private adversarial ledger.
create or replace function set_game_flag(p_field text, p_value boolean, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002', message='game_state_not_found'; end if;

  if p_field='voting_open' then
    if p_value and not v_state.voting_open then
      update game_state set voting_open=true,results_visible=false,stage='voting',
        voting_round=voting_round+1,voting_opened_at=now(),voting_closed_at=null,
        results_published_at=null,updated_at=now() where id=1;
    elsif not p_value and v_state.voting_open then
      update game_state set voting_open=false,voting_closed_at=coalesce(voting_closed_at,now()),updated_at=now() where id=1;
    end if;
  elsif p_field='results_visible' then
    if p_value then
      if v_state.voting_round<1 then raise exception using errcode='P0001', message='voting_not_started'; end if;
      update game_state set voting_open=false,results_visible=true,stage='results',
        voting_closed_at=coalesce(voting_closed_at,now()),
        results_published_at=coalesce(results_published_at,now()),updated_at=now() where id=1;
      perform settle_voting_results(v_state.voting_round,p_actor);
      perform settle_spy_results(v_state.voting_round,p_actor);
    else
      update game_state set results_visible=false,results_published_at=null,updated_at=now() where id=1;
    end if;
  elsif p_field='scoreboard_visible' then
    update game_state set scoreboard_visible=p_value,updated_at=now() where id=1;
  else
    raise exception using errcode='22023', message='invalid_game_flag';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values (p_actor,'game_state.' || p_field,'game_state','1',
    jsonb_build_object('value',p_value,'voting_round',(select voting_round from game_state where id=1)));
end;
$$;

revoke all on function record_spy_point_event(uuid,text,text,uuid,text) from public, anon, authenticated;
revoke all on function settle_spy_results(integer,text) from public, anon, authenticated;
revoke all on function set_game_flag(text,boolean,text) from public, anon, authenticated;
grant execute on function record_spy_point_event(uuid,text,text,uuid,text) to service_role;
grant execute on function settle_spy_results(integer,text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
