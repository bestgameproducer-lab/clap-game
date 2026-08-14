-- Remove only residual clues that can still be proven to have come from the
-- retired mission-completion reward path. Earlier cleanup cleared the live
-- assignment links, so the immutable assignment.approve audit record is also
-- used as provenance. One historical repair copied a recipient's whole clue
-- set to their teammates, so every grant of a proven reward clue is removed,
-- not only the original recipient's row. A historical automatic reward may
-- also have collided with a later team settlement's ON CONFLICT grant; current
-- team-settlement pairs are therefore reconstructed and preserved explicitly.

begin;

with assignment_reward_links as (
  select a.id assignment_id,a.guest_id,a.reward_clue_id,a.reward_task_id
  from assignments a
  where a.reward_clue_id is not null or a.reward_task_id is not null
), audited_reward_links as (
  select
    null::uuid assignment_id,
    case when coalesce(log.details->>'guest_id','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (log.details->>'guest_id')::uuid end guest_id,
    case when coalesce(log.details->>'reward_clue_id','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (log.details->>'reward_clue_id')::uuid end reward_clue_id,
    null::uuid reward_task_id
  from audit_log log
  where log.action='assignment.approve'
    and coalesce(log.details->>'reward_clue_id','') not in ('','null')
), legacy_reward_links as (
  select * from assignment_reward_links
  union
  select * from audited_reward_links
  where guest_id is not null and reward_clue_id is not null
), team_totals as (
  select expected.team,
    coalesce(
      nullif(state.team_score_snapshot->>expected.team,'')::integer,
      ledger.score,
      0
    ) score,
    state.team_clues_settled_at
  from game_state state
  cross join (values('海岛组'::text),('沙漠组'::text)) expected(team)
  left join (
    select team,sum(amount)::integer score
    from team_points_ledger
    where team in ('海岛组','沙漠组')
    group by team
  ) ledger using(team)
  where state.id=1
), ranked_teams as (
  select team,team_clues_settled_at,
    dense_rank() over(order by score desc)::integer team_rank
  from team_totals
), current_team_clues as (
  select ranked.team,selected.clue_id
  from ranked_teams ranked
  cross join lateral (
    select clue.id clue_id
    from clues clue
    cross join lateral (
      -- PostgreSQL does not provide min(uuid) in the production version.
      -- array_agg with an explicit order keeps the selected UUID stable while
      -- preserving the separate exact-count invariant below.
      select (array_agg(guest.id order by guest.id))[1] spy_id,
        count(*)::integer spy_count
      from guests guest
      where guest.active and guest.uses_app
        and guest.participation_mode='ACTIVE_PLAYER'
        and guest.phase_two_eligible and guest.drawn_at is not null
        and guest.role='spy' and not guest.is_hidden_spy
        and guest.team=ranked.team
    ) spy
    where clue.active and clue.team_scope=ranked.team
      and spy.spy_count=1
      and (clue.spy_guest_id=spy.spy_id or clue.spy_guest_id is null)
    order by case when clue.spy_guest_id=spy.spy_id then 0 else 1 end,
      clue.level,clue.created_at,clue.id
    limit case when ranked.team_rank=1 then 2 else 1 end
  ) selected
  where ranked.team_clues_settled_at is not null
), current_team_grants as (
  select guest.id guest_id,team_clue.clue_id
  from current_team_clues team_clue
  join guests guest on guest.team=team_clue.team
  where guest.active and guest.uses_app
    and guest.participation_mode='ACTIVE_PLAYER'
    and guest.phase_two_eligible and guest.drawn_at is not null
), explicit_staff_grants as (
  select distinct
    (log.details->>'guest_id')::uuid guest_id,
    (log.details->>'clue_id')::uuid clue_id
  from audit_log log
  where log.action='clue.grant'
    and coalesce(log.details->>'guest_id','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and coalesce(log.details->>'clue_id','')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
), revoked_clues as (
  delete from guest_clues gc
  using legacy_reward_links legacy
  where legacy.reward_clue_id is not null
    and gc.clue_id=legacy.reward_clue_id
    and not exists(
      select 1 from current_team_grants current_grant
      where current_grant.guest_id=gc.guest_id
        and current_grant.clue_id=gc.clue_id
    )
    and not exists(
      select 1 from explicit_staff_grants staff_grant
      where staff_grant.guest_id=gc.guest_id
        and staff_grant.clue_id=gc.clue_id
    )
  returning gc.id,gc.guest_id,gc.clue_id,legacy.assignment_id
), revoked_summary as (
  select count(*)::integer count,
    coalesce(jsonb_agg(jsonb_build_object(
      'guest_clue_id',id,'guest_id',guest_id,'clue_id',clue_id,
      'source_assignment_id',assignment_id
    ) order by id),'[]'::jsonb) revoked
  from revoked_clues
), cleared_links as (
  update assignments a set reward_clue_id=null,reward_task_id=null
  from legacy_reward_links legacy
  where a.id=legacy.assignment_id
  returning a.id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130013','assignment.residual_clue_rewards_revoked',
  'guest_clues','batch',jsonb_build_object(
    'revoked_guest_clue_count',summary.count,
    'cleared_assignment_link_count',(select count(*) from cleared_links),
    'revoked',summary.revoked,
    'selection_rule','clue proven by assignment reward link or immutable assignment.approve audit, including propagated teammate copies',
    'team_collision_protection','current settled team clue pairs reconstructed and preserved',
    'staff_collision_protection','successful explicit clue.grant audit pairs preserved',
    'team_and_staff_grants_preserved',true,
    'clue_library_preserved',true
  )
from revoked_summary summary;

commit;
