-- Keep team clues available to every active player on that team, preserve the
-- trickster's first-act mission across act boundaries, and freeze team scores
-- at the explicit pre-vote settlement boundary.

begin;

-- The existing settlement function is otherwise correct. Remove both legacy
-- recipient exclusions: story-role players and the team's trickster are still
-- active team players and must receive the same settled clues.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.settle_phase_two_team_clues(text)'::regprocedure)
  into v_definition;

  v_updated:=replace(
    v_definition,
    'and g.eligible_for_secret_role and g.team=v_team.team and g.id<>v_spy_id',
    'and g.team=v_team.team'
  );

  if v_updated=v_definition
      or position('g.eligible_for_secret_role' in v_updated)>0
      or position('g.id<>v_spy_id' in v_updated)>0 then
    raise exception using errcode='P0001',message='team_clue_recipient_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

-- The original table guard predates phase two and only admits guests who were
-- eligible for a random secret role. Keep that protection for ordinary manual
-- grants, while also admitting drawn competitive players who explicitly
-- participate in phase two. Honor guests and principals remain excluded.
create or replace function enforce_secret_clue_guest_eligibility()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(
    select 1 from guests
    where id=new.guest_id and active and (
      eligible_for_secret_role
      or (
        participation_mode='ACTIVE_PLAYER'
        and drawn_at is not null
        and phase_two_eligible
        and team in ('海岛组','沙漠组')
      )
    )
  ) then
    raise exception using errcode='P0001',message='guest_not_secret_clue_eligible';
  end if;
  return new;
end;
$$;

revoke all on function enforce_secret_clue_guest_eligibility()
  from public,anon,authenticated;

-- A live settlement may already have happened. Each team already has a known,
-- auditable selected clue set in guest_clues; copy only that exact set to any
-- missing drawn phase-two teammate. No clue content or new selection is made.
with settled_team_clues as (
  select distinct g.team,gc.clue_id
  from guest_clues gc
  join guests g on g.id=gc.guest_id
  where g.team in ('海岛组','沙漠组')
), missing_grants as (
  select recipient.id guest_id,selected.clue_id
  from guests recipient
  join settled_team_clues selected on selected.team=recipient.team
  where recipient.active and recipient.drawn_at is not null
    and recipient.phase_two_eligible
    and recipient.team in ('海岛组','沙漠组')
)
insert into guest_clues(guest_id,clue_id,granted_by)
select guest_id,clue_id,'migration:202608020001'
from missing_grants
on conflict(guest_id,clue_id) do nothing;

-- The trickster signal mission belongs to the whole wedding, not only act one.
-- Keep it out of phase-one cleanup and restore any live row that cleanup had
-- already cancelled. Its score policy remains NO_PERSONAL (zero trickster
-- bonus), matching the approved game rules.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.finalize_phase_one_content(text)'::regprocedure)
  into v_definition;
  v_updated:=replace(
    v_definition,
    'and a.status in(''assigned'',''rejected'');',
    'and a.status in(''assigned'',''rejected'') and t.mission_code<>''P1-TRICKSTER-001'';'
  );
  if v_updated=v_definition or position(
      'and a.status in(''assigned'',''rejected'');' in v_updated)>0 then
    raise exception using errcode='P0001',message='trickster_phase_cleanup_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

update assignments a
set status='assigned',cancelled_at=null,rejection_reason=null
from tasks t,guests g
where a.task_id=t.id and a.guest_id=g.id
  and t.mission_code='P1-TRICKSTER-001'
  and g.active and g.drawn_at is not null and g.role='spy'
  and a.status='cancelled';

-- Final voting still awards a personal point for a correct vote and settles
-- explicit phase-two personal abilities. It must not mutate frozen team totals.
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
    values(p_voting_round,'guest_detective',v_vote.voter_guest_id,1,
      jsonb_build_object('reason','正确找出本队恶作剧者'))
    on conflict do nothing returning id into v_reward_id;
    if v_reward_id is not null then
      update guests set points=points+1 where id=v_vote.voter_guest_id;
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_vote.voter_guest_id,1,'终局投票正确找出恶作剧者',p_actor);
      v_guest_rewards:=v_guest_rewards+1;
    end if;
  end loop;
  perform settle_phase_two_lucky(p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'results.settle','voting_round',p_voting_round::text,jsonb_build_object(
    'guest_detective_rewards',v_guest_rewards,'team_detective_rewards',0,
    'team_completion_rewards',0,'weighted_ballots',true,'team_scores_frozen',true));
  return jsonb_build_object('guest_detective_rewards',v_guest_rewards,
    'team_detective_rewards',0,'team_completion_rewards',0);
end;
$$;

revoke all on function settle_voting_results_with_lucky_v1(integer,text)
  from public,anon,authenticated,service_role;

-- Preserve the historical reward rows and ledger entries, but neutralize the
-- already-applied implicit team bonuses with idempotent, auditable corrections.
with corrections as (
  select rr.team,-sum(rr.amount)::integer amount
  from result_rewards rr
  where rr.team in ('海岛组','沙漠组')
    and rr.reward_type in ('team_detective','team_completion')
  group by rr.team
), unapplied as (
  select c.* from corrections c
  where c.amount<>0 and not exists(
    select 1 from team_points_ledger l
    where l.team=c.team and l.actor='migration:202608020001'
      and l.reason='终局隐含团队奖励冲正'
  )
)
insert into team_points_ledger(team,amount,reason,actor)
select team,amount,'终局隐含团队奖励冲正','migration:202608020001'
from unapplied;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608020001','phase_two.consistency_fixed','game_state','1',jsonb_build_object(
  'all_active_teammates_receive_settled_clues',true,
  'trickster_first_act_mission_cross_stage',true,
  'trickster_bonus_points_restored',false,
  'team_scores_frozen_before_voting',true,
  'historical_team_rewards_preserved_with_corrections',true));

commit;
