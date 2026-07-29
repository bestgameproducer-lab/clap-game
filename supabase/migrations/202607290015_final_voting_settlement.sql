-- Immutable voting rounds and idempotent final-result rewards.
alter table game_state add column if not exists voting_round integer not null default 0;
alter table votes add column if not exists voting_round integer not null default 0;

alter table votes drop constraint if exists votes_voter_guest_id_key;
create unique index if not exists votes_one_per_guest_round_idx
on votes (voter_guest_id, voting_round);
create index if not exists votes_round_created_idx on votes (voting_round, created_at);

create table if not exists result_rewards (
  id bigserial primary key,
  voting_round integer not null check (voting_round > 0),
  reward_type text not null check (reward_type in ('guest_detective','team_detective','team_completion')),
  guest_id uuid references guests(id) on delete cascade,
  team text check (team is null or team in ('玫瑰组','月桂组','星辰组','琥珀组')),
  amount integer not null check (amount between 1 and 10),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((guest_id is not null and team is null) or (guest_id is null and team is not null))
);

create unique index if not exists result_rewards_guest_once_idx
on result_rewards (voting_round, reward_type, guest_id) where guest_id is not null;
create unique index if not exists result_rewards_team_once_idx
on result_rewards (voting_round, reward_type, team) where team is not null;
alter table result_rewards enable row level security;
revoke all on result_rewards from public, anon, authenticated;

create or replace function settle_voting_results(p_voting_round integer, p_actor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vote record;
  v_team record;
  v_reward_id bigint;
  v_guest_rewards integer := 0;
  v_team_detective_rewards integer := 0;
  v_team_completion_rewards integer := 0;
  v_completion_points integer;
begin
  if p_voting_round < 1 then
    raise exception using errcode='22023', message='voting_not_started';
  end if;

  -- Every guest who correctly identifies a spy receives one personal point.
  for v_vote in
    select v.voter_guest_id
    from votes v
    join guests target on target.id = v.target_guest_id
    where v.voting_round = p_voting_round and target.role = 'spy'
  loop
    v_reward_id := null;
    insert into result_rewards (voting_round,reward_type,guest_id,amount,details)
    values (p_voting_round,'guest_detective',v_vote.voter_guest_id,1,
      jsonb_build_object('reason','正确找出本队恶作剧者'))
    on conflict (voting_round,reward_type,guest_id) where guest_id is not null do nothing
    returning id into v_reward_id;
    if v_reward_id is not null then
      update guests set points = points + 1 where id = v_vote.voter_guest_id;
      insert into points_ledger (guest_id,amount,reason,actor)
      values (v_vote.voter_guest_id,1,'终局投票正确找出恶作剧者',p_actor);
      v_guest_rewards := v_guest_rewards + 1;
    end if;
  end loop;

  -- A team identifies its spy when more than half of its submitted ballots are correct.
  for v_team in
    select voter.team,
      count(*)::integer as total_votes,
      count(*) filter (where target.role = 'spy')::integer as correct_votes
    from votes v
    join guests voter on voter.id = v.voter_guest_id
    join guests target on target.id = v.target_guest_id
    where v.voting_round = p_voting_round
    group by voter.team
  loop
    if v_team.correct_votes * 2 > v_team.total_votes then
      v_reward_id := null;
      insert into result_rewards (voting_round,reward_type,team,amount,details)
      values (p_voting_round,'team_detective',v_team.team,3,
        jsonb_build_object('correct_votes',v_team.correct_votes,'total_votes',v_team.total_votes))
      on conflict (voting_round,reward_type,team) where team is not null do nothing
      returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger (team,amount,reason,actor)
        values (v_team.team,3,'终局投票多数正确找出恶作剧者',p_actor);
        v_team_detective_rewards := v_team_detective_rewards + 1;
      end if;
    end if;
  end loop;

  -- Initial-task completion awards: >50%=1, >75%=2, 100%=3 team points.
  for v_team in
    select g.team,
      count(*)::integer as total_guests,
      count(*) filter (where exists (
        select 1 from assignments a
        where a.guest_id = g.id and a.is_initial and a.status = 'approved'
      ))::integer as completed_guests
    from guests g
    where g.drawn_at is not null
    group by g.team
  loop
    v_completion_points := case
      when v_team.completed_guests = v_team.total_guests then 3
      when v_team.completed_guests * 4 > v_team.total_guests * 3 then 2
      when v_team.completed_guests * 2 > v_team.total_guests then 1
      else 0
    end;
    if v_completion_points > 0 then
      v_reward_id := null;
      insert into result_rewards (voting_round,reward_type,team,amount,details)
      values (p_voting_round,'team_completion',v_team.team,v_completion_points,
        jsonb_build_object('completed_guests',v_team.completed_guests,'total_guests',v_team.total_guests))
      on conflict (voting_round,reward_type,team) where team is not null do nothing
      returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger (team,amount,reason,actor)
        values (v_team.team,v_completion_points,'首轮任务团队完成率奖励',p_actor);
        v_team_completion_rewards := v_team_completion_rewards + 1;
      end if;
    end if;
  end loop;

  insert into audit_log (actor,action,target_type,target_id,details)
  values (p_actor,'results.settle','voting_round',p_voting_round::text,
    jsonb_build_object('guest_detective_rewards',v_guest_rewards,
      'team_detective_rewards',v_team_detective_rewards,
      'team_completion_rewards',v_team_completion_rewards));

  return jsonb_build_object('guest_detective_rewards',v_guest_rewards,
    'team_detective_rewards',v_team_detective_rewards,
    'team_completion_rewards',v_team_completion_rewards);
end;
$$;

create or replace function set_game_flag(p_field text, p_value boolean, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state game_state%rowtype;
begin
  select * into v_state from game_state where id = 1 for update;
  if not found then raise exception using errcode='P0002', message='game_state_not_found'; end if;

  if p_field = 'voting_open' then
    if p_value and not v_state.voting_open then
      update game_state
      set voting_open = true, results_visible = false, stage = 'voting',
          voting_round = voting_round + 1, voting_opened_at = now(), voting_closed_at = null,
          results_published_at = null, updated_at = now()
      where id = 1;
    elsif not p_value and v_state.voting_open then
      update game_state
      set voting_open = false, voting_closed_at = coalesce(voting_closed_at,now()), updated_at = now()
      where id = 1;
    end if;
  elsif p_field = 'results_visible' then
    if p_value then
      if v_state.voting_round < 1 then raise exception using errcode='P0001', message='voting_not_started'; end if;
      update game_state
      set voting_open = false, results_visible = true, stage = 'results',
          voting_closed_at = coalesce(voting_closed_at,now()), results_published_at = coalesce(results_published_at,now()),
          updated_at = now()
      where id = 1;
      perform settle_voting_results(v_state.voting_round,p_actor);
    else
      update game_state set results_visible = false, results_published_at = null, updated_at = now() where id = 1;
    end if;
  elsif p_field = 'scoreboard_visible' then
    update game_state set scoreboard_visible = p_value, updated_at = now() where id = 1;
  else
    raise exception using errcode='22023', message='invalid_game_flag';
  end if;

  insert into audit_log (actor,action,target_type,target_id,details)
  values (p_actor,'game_state.' || p_field,'game_state','1',
    jsonb_build_object('value',p_value,'voting_round',(select voting_round from game_state where id=1)));
end;
$$;

create or replace function cast_team_vote(p_voter_guest_id uuid, p_target_guest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter_team text;
  v_target_team text;
  v_state game_state%rowtype;
begin
  if p_voter_guest_id = p_target_guest_id then raise exception using errcode='22023', message='self_vote'; end if;
  select * into v_state from game_state where id = 1 for share;
  if not coalesce(v_state.voting_open,false) then raise exception using errcode='P0001', message='voting_closed'; end if;
  select team into v_voter_team from guests where id = p_voter_guest_id;
  select team into v_target_team from guests where id = p_target_guest_id;
  if v_voter_team is null or v_target_team is null then raise exception using errcode='P0002', message='guest_not_found'; end if;
  if v_voter_team <> v_target_team then raise exception using errcode='22023', message='cross_team_vote'; end if;

  begin
    insert into votes (voter_guest_id,target_guest_id,voting_round)
    values (p_voter_guest_id,p_target_guest_id,v_state.voting_round);
  exception when unique_violation then
    raise exception using errcode='P0001', message='vote_already_cast';
  end;

  insert into audit_log (actor,action,target_type,target_id,details)
  values ('guest:' || p_voter_guest_id::text,'vote.cast','vote',p_voter_guest_id::text,
    jsonb_build_object('target_id',p_target_guest_id,'voting_round',v_state.voting_round));
end;
$$;

revoke all on function settle_voting_results(integer,text) from public, anon, authenticated;
revoke all on function set_game_flag(text,boolean,text) from public, anon, authenticated;
revoke all on function cast_team_vote(uuid,uuid) from public, anon, authenticated;
grant execute on function settle_voting_results(integer,text) to service_role;
grant execute on function set_game_flag(text,boolean,text) to service_role;
grant execute on function cast_team_vote(uuid,uuid) to service_role;
