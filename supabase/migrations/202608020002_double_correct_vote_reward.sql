-- A correct final vote is now worth two personal points. Keep the existing
-- idempotency key, frozen team totals, and phase-two ability settlement intact.

begin;

create or replace function settle_voting_results_with_lucky_v1(
  p_voting_round integer,p_actor text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_vote record;
  v_reward_id bigint;
  v_guest_rewards integer:=0;
begin
  if p_voting_round<1 then
    raise exception using errcode='22023',message='voting_not_started';
  end if;
  for v_vote in
    select v.voter_guest_id
    from votes v
    join guests target on target.id=v.target_guest_id
    where v.voting_round=p_voting_round and target.role='spy'
  loop
    v_reward_id:=null;
    insert into result_rewards(voting_round,reward_type,guest_id,amount,details)
    values(p_voting_round,'guest_detective',v_vote.voter_guest_id,2,
      jsonb_build_object('reason','正确找出本队恶作剧者'))
    on conflict do nothing returning id into v_reward_id;
    if v_reward_id is not null then
      update guests set points=points+2 where id=v_vote.voter_guest_id;
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_vote.voter_guest_id,2,'终局投票正确找出恶作剧者',p_actor);
      v_guest_rewards:=v_guest_rewards+1;
    end if;
  end loop;
  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'guest_detective_rewards',v_guest_rewards,'guest_detective_points_each',2,
    'team_detective_rewards',0,'team_completion_rewards',0,
    'weighted_ballots',true,'team_scores_frozen',true));
  return jsonb_build_object('guest_detective_rewards',v_guest_rewards,
    'guest_detective_points_each',2,'team_detective_rewards',0,'team_completion_rewards',0);
end;
$$;

revoke all on function settle_voting_results_with_lucky_v1(integer,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608020002','voting.correct_reward_updated','game_state','1',
  jsonb_build_object('correct_vote_personal_points',2,'team_scores_frozen',true,
    'existing_rewards_preserved',true));

commit;
