-- Final team rewards belong only to the two competitive teams. Honor guests in
-- the family group can hold personal points but must never create a team reward.

begin;

create or replace function settle_voting_results_with_lucky_v1(p_voting_round integer,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_vote record; v_team record; v_reward_id bigint; v_guest_rewards integer:=0;
  v_team_detective_rewards integer:=0; v_team_completion_rewards integer:=0; v_completion_points integer;
begin
  if p_voting_round<1 then raise exception using errcode='22023',message='voting_not_started'; end if;
  for v_vote in select v.voter_guest_id from votes v join guests target on target.id=v.target_guest_id
    where v.voting_round=p_voting_round and target.role='spy'
  loop
    v_reward_id:=null;
    insert into result_rewards(voting_round,reward_type,guest_id,amount,details)
    values(p_voting_round,'guest_detective',v_vote.voter_guest_id,1,jsonb_build_object('reason','正确找出本队恶作剧者'))
    on conflict do nothing returning id into v_reward_id;
    if v_reward_id is not null then
      update guests set points=points+1 where id=v_vote.voter_guest_id;
      insert into points_ledger(guest_id,amount,reason,actor) values(v_vote.voter_guest_id,1,'终局投票正确找出恶作剧者',p_actor);
      v_guest_rewards:=v_guest_rewards+1;
    end if;
  end loop;
  for v_team in select voter.team,sum(v.vote_weight)::integer total_votes,
      sum(v.vote_weight) filter(where target.role='spy')::integer correct_votes
    from votes v join guests voter on voter.id=v.voter_guest_id join guests target on target.id=v.target_guest_id
    where v.voting_round=p_voting_round and voter.team in('海岛组','沙漠组') group by voter.team
  loop
    if v_team.correct_votes*2>v_team.total_votes then
      v_reward_id:=null;
      insert into result_rewards(voting_round,reward_type,team,amount,details)
      values(p_voting_round,'team_detective',v_team.team,3,jsonb_build_object('correct_votes',v_team.correct_votes,'total_votes',v_team.total_votes))
      on conflict do nothing returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger(team,amount,reason,actor) values(v_team.team,3,'终局投票多数正确找出恶作剧者',p_actor);
        v_team_detective_rewards:=v_team_detective_rewards+1;
      end if;
    end if;
  end loop;
  for v_team in select g.team,count(*)::integer total_guests,count(*) filter(where exists(
      select 1 from assignments a where a.guest_id=g.id and a.is_initial and a.status='approved'))::integer completed_guests
    from guests g where g.drawn_at is not null and g.team in('海岛组','沙漠组') group by g.team
  loop
    v_completion_points:=case when v_team.completed_guests=v_team.total_guests then 3
      when v_team.completed_guests*4>v_team.total_guests*3 then 2
      when v_team.completed_guests*2>v_team.total_guests then 1 else 0 end;
    if v_completion_points>0 then
      v_reward_id:=null;
      insert into result_rewards(voting_round,reward_type,team,amount,details)
      values(p_voting_round,'team_completion',v_team.team,v_completion_points,
        jsonb_build_object('completed_guests',v_team.completed_guests,'total_guests',v_team.total_guests))
      on conflict do nothing returning id into v_reward_id;
      if v_reward_id is not null then
        insert into team_points_ledger(team,amount,reason,actor) values(v_team.team,v_completion_points,'首轮任务团队完成率奖励',p_actor);
        v_team_completion_rewards:=v_team_completion_rewards+1;
      end if;
    end if;
  end loop;
  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'guest_detective_rewards',v_guest_rewards,'team_detective_rewards',v_team_detective_rewards,
    'team_completion_rewards',v_team_completion_rewards,'weighted_ballots',true));
  return jsonb_build_object('guest_detective_rewards',v_guest_rewards,
    'team_detective_rewards',v_team_detective_rewards,'team_completion_rewards',v_team_completion_rewards);
end;
$$;

revoke all on function settle_voting_results_with_lucky_v1(integer,text) from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310029','results.limit_competitive_teams','game_state','1',jsonb_build_object(
  'existing_runtime_preserved',true,'eligible_teams',jsonb_build_array('海岛组','沙漠组')));

commit;
