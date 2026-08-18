-- Family wins become a one-point random personal award because the family
-- group has no team score. Final-vote rewards now depend on actually catching
-- the team's trickster: correct voters receive two points, other submitted
-- voters receive one point, and an escaped trickster yields no vote rewards.

begin;

create or replace function award_random_family_guest_point_for_run(
  p_event_key uuid,
  p_actor text,
  p_rehearsal_run_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing points_ledger%rowtype;
  v_guest guests%rowtype;
  v_state game_state%rowtype;
  v_total integer;
  v_pool_size integer;
  v_reason constant text:='家人组游戏胜利随机奖励';
begin
  if p_event_key is null then
    raise exception using errcode='22023',message='score_event_key_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  perform assert_current_rehearsal_run(p_rehearsal_run_id);
  perform pg_advisory_xact_lock(hashtext('host-family-random:'||p_event_key::text));

  select * into v_existing from points_ledger where event_key=p_event_key;
  if found then
    select * into v_guest from guests where id=v_existing.guest_id;
    if not found or v_existing.amount<>1 or v_existing.reason<>v_reason
        or v_guest.team<>'家人组' then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
    return jsonb_build_object(
      'guest_id',v_guest.id,
      'guest_name',v_guest.name,
      'total',v_guest.points,
      'amount',1,
      'replayed',true
    );
  end if;

  select * into v_state from game_state where id=1 for update;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_state.results_published_at is not null or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if v_state.stage<>'group_game' then
    raise exception using errcode='P0001',message='family_random_score_stage_closed';
  end if;

  select count(*)::integer into v_pool_size
  from guests
  where active and uses_app and eligible_for_personal_score and team='家人组';

  select * into v_guest
  from guests
  where active and uses_app and eligible_for_personal_score and team='家人组'
  order by random()
  limit 1
  for update;
  if not found then
    raise exception using errcode='P0001',message='family_random_guest_unavailable';
  end if;

  v_total:=v_guest.points+1;
  update guests set points=v_total where id=v_guest.id;
  insert into points_ledger(guest_id,amount,reason,event_key,actor)
  values(v_guest.id,1,v_reason,p_event_key,p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.family_random_point','guest',v_guest.id::text,jsonb_build_object(
    'amount',1,
    'before',v_guest.points,
    'after',v_total,
    'event_key',p_event_key,
    'selection_pool',v_pool_size,
    'rehearsal_run_id',p_rehearsal_run_id
  ));

  return jsonb_build_object(
    'guest_id',v_guest.id,
    'guest_name',v_guest.name,
    'total',v_total,
    'amount',1,
    'replayed',false
  );
end;
$$;

create or replace function settle_voting_results_with_lucky_v1(
  p_voting_round integer,
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team record;
  v_vote record;
  v_reward_id bigint;
  v_amount integer;
  v_correct_rewards integer:=0;
  v_participation_rewards integer:=0;
  v_captured_teams integer:=0;
begin
  if p_voting_round<1 then
    raise exception using errcode='22023',message='voting_not_started';
  end if;

  for v_team in
    select
      spy.id as trickster_id,
      spy.team,
      coalesce((
        select sum(coalesce(v.vote_weight,1))::integer
        from votes v
        where v.voting_round=p_voting_round and v.target_guest_id=spy.id
      ),0) as trickster_votes,
      coalesce((
        select max(tally.total_votes)
        from (
          select sum(coalesce(v.vote_weight,1))::integer as total_votes
          from votes v
          join guests voter on voter.id=v.voter_guest_id
          where v.voting_round=p_voting_round and voter.team=spy.team
          group by v.target_guest_id
        ) tally
      ),0) as top_votes
    from guests spy
    where spy.active and spy.uses_app
      and spy.participation_mode='ACTIVE_PLAYER'
      and spy.phase_two_eligible and spy.drawn_at is not null
      and spy.role='spy' and not spy.is_hidden_spy
      and spy.team in('海岛组','沙漠组')
  loop
    if v_team.trickster_votes>0 and v_team.trickster_votes=v_team.top_votes then
      v_captured_teams:=v_captured_teams+1;
      for v_vote in
        select
          v.voter_guest_id,
          v.target_guest_id=v_team.trickster_id as is_correct
        from votes v
        join guests voter on voter.id=v.voter_guest_id
        where v.voting_round=p_voting_round and voter.team=v_team.team
      loop
        v_amount:=case when v_vote.is_correct then 2 else 1 end;
        v_reward_id:=null;
        insert into result_rewards(voting_round,reward_type,guest_id,amount,details)
        values(
          p_voting_round,
          'guest_detective',
          v_vote.voter_guest_id,
          v_amount,
          jsonb_build_object(
            'reason',case when v_vote.is_correct
              then '投中并成功抓出本队恶作剧者'
              else '本队成功抓出恶作剧者的参与奖励'
            end,
            'team',v_team.team,
            'team_caught',true,
            'vote_correct',v_vote.is_correct
          )
        )
        on conflict do nothing returning id into v_reward_id;
        if v_reward_id is not null then
          update guests set points=points+v_amount where id=v_vote.voter_guest_id;
          insert into points_ledger(guest_id,amount,reason,actor)
          values(
            v_vote.voter_guest_id,
            v_amount,
            case when v_vote.is_correct
              then '终局投票成功追捕并投中恶作剧者'
              else '终局投票成功追捕参与奖励'
            end,
            p_actor
          );
          if v_vote.is_correct then
            v_correct_rewards:=v_correct_rewards+1;
          else
            v_participation_rewards:=v_participation_rewards+1;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'captured_teams',v_captured_teams,
    'correct_vote_rewards',v_correct_rewards,
    'participation_rewards',v_participation_rewards,
    'correct_vote_points_each',2,
    'other_submitted_vote_points_each',1,
    'escaped_team_vote_points_each',0,
    'team_detective_rewards',0,
    'team_completion_rewards',0,
    'weighted_ballots',true,
    'team_scores_frozen',true
  ));
  return jsonb_build_object(
    'captured_teams',v_captured_teams,
    'correct_vote_rewards',v_correct_rewards,
    'participation_rewards',v_participation_rewards,
    'correct_vote_points_each',2,
    'other_submitted_vote_points_each',1,
    'escaped_team_vote_points_each',0,
    'team_detective_rewards',0,
    'team_completion_rewards',0
  );
end;
$$;

revoke all on function award_random_family_guest_point_for_run(uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function award_random_family_guest_point_for_run(uuid,text,uuid)
  to service_role;
revoke all on function settle_voting_results_with_lucky_v1(integer,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608180001','scoring.family_random_and_capture_rewards','game_state','1',
  jsonb_build_object(
    'family_random_personal_points',1,
    'family_team_score_created',false,
    'correct_vote_points_when_caught',2,
    'other_submitted_vote_points_when_caught',1,
    'vote_points_when_escaped',0,
    'existing_runtime_preserved',true
  ));

commit;
