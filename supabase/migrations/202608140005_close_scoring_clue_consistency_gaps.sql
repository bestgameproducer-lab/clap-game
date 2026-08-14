-- Close four consistency gaps left by late compatibility migrations:
--   1. application code may only approve through the rehearsal-run wrapper;
--   2. system completion selects the exact official mission, never a legacy
--      task that happens to reuse the same mechanic;
--   3. a team is first only when the highest score is positive (positive ties
--      are joint first; a 0:0 result has no first-place team);
--   4. a clue selected by team settlement remains active and recoverable until
--      the terminal result lock or an explicit rehearsal reset.

begin;

create or replace function complete_system_mission_before_final_lock(
  p_guest_id uuid,p_mechanic text,p_actor text,p_note text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_assignment assignments%rowtype;
  v_mission_code text;
  v_points integer;
  v_score_policy text;
  v_eligible boolean;
begin
  v_mission_code:=case p_mechanic
    when 'HEART_MATCH' then 'P1-HEART-001'
    when 'STAR_MATCH' then 'P1-STAR-001'
    when 'TRICKSTER_SIGNAL' then 'P1-TRICKSTER-001'
    when 'INSTANT_BONUS' then 'P1-BONUS-001'
    else null
  end;
  if v_mission_code is null then
    raise exception using errcode='22023',message='invalid_system_mission_mechanic';
  end if;

  select a.* into v_assignment
  from assignments a
  join tasks t on t.id=a.task_id
  join guests g on g.id=a.guest_id
  where a.guest_id=p_guest_id
    and a.status in('assigned','rejected','submitted')
    and t.mission_code=v_mission_code
    and is_official_wedding_mission_code(t.mission_code)
    and t.mechanic=p_mechanic
    and t.stage='task_round_1'
    and t.formal_allowed and t.active
    and (v_mission_code='P1-TRICKSTER-001' or a.is_initial)
    and g.active and g.uses_app and g.drawn_at is not null
    and (v_mission_code<>'P1-TRICKSTER-001' or g.role='spy')
  order by a.created_at,a.id
  limit 1
  for update of a;
  if not found then return null; end if;

  select points,score_policy into v_points,v_score_policy
  from tasks where id=v_assignment.task_id;
  select eligible_for_personal_score into v_eligible
  from guests where id=p_guest_id for update;
  if v_score_policy='STANDARD' and v_eligible then
    insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
    values(p_guest_id,v_assignment.id,v_points,p_note,p_actor);
    update guests set points=points+v_points where id=p_guest_id;
  end if;
  update assignments set
    status='approved',submitted_at=coalesce(submitted_at,now()),approved_at=now(),
    verification_note=p_note,verified_by=p_actor,verified_at=now(),
    rejection_reason=null
  where id=v_assignment.id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'assignment.system_complete','assignment',v_assignment.id::text,
    jsonb_build_object(
      'guest_id',p_guest_id,'mechanic',p_mechanic,
      'mission_code',v_mission_code,'official_exact_match',true,
      'points_awarded',case
        when v_score_policy='STANDARD' and v_eligible then v_points else 0 end
    ));
  return v_assignment.id;
end;
$$;

create or replace function settle_phase_two_team_clues(p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_team record;
  v_spy_id uuid;
  v_spy_count integer;
  v_clue_ids uuid[];
  v_clue_count integer;
  v_inserted integer;
  v_total_inserted integer:=0;
  v_first_place boolean;
  v_reported_rank integer;
  v_team_result jsonb;
  v_result jsonb:='[]'::jsonb;
begin
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-team-clues-v2'));
  select * into v_state from game_state where id=1 for update;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_state.stage<>'group_game' then
    raise exception using errcode='P0001',message='team_clue_settlement_stage_not_ready';
  end if;
  if v_state.team_clues_settled_at is not null then
    return jsonb_build_object(
      'already_settled',true,'settled_at',v_state.team_clues_settled_at
    );
  end if;
  if exists(
    select 1
    from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where (select count(*) from guests where active and uses_app
      and participation_mode='ACTIVE_PLAYER' and phase_two_eligible
      and drawn_at is not null and team=expected.team)<>10
  ) then
    raise exception using errcode='P0001',message='phase_two_team_draws_incomplete';
  end if;
  if exists(
    select 1
    from (values('海岛组'::text),('沙漠组'::text)) expected(team)
    where not exists(select 1 from team_points_ledger l where l.team=expected.team)
  ) then
    raise exception using errcode='P0001',message='phase_two_team_scores_missing';
  end if;

  for v_team in
    with totals as(
      select team,coalesce(sum(amount),0)::integer score
      from team_points_ledger
      where team in('海岛组','沙漠组')
      group by team
    ), complete_totals as(
      select expected.team,coalesce(t.score,0)::integer score
      from (values('海岛组'::text),('沙漠组'::text)) expected(team)
      left join totals t using(team)
    )
    select team,score,
      max(score) over()::integer top_score,
      dense_rank() over(order by score desc)::integer dense_team_rank
    from complete_totals
  loop
    v_first_place:=v_team.top_score>0 and v_team.score=v_team.top_score;
    v_clue_count:=case when v_first_place then 2 else 1 end;
    v_reported_rank:=case
      when v_team.top_score<=0 then null else v_team.dense_team_rank end;

    select (array_agg(id order by id))[1],count(*)::integer
    into v_spy_id,v_spy_count
    from guests
    where active and uses_app and participation_mode='ACTIVE_PLAYER'
      and phase_two_eligible and drawn_at is not null and role='spy'
      and not is_hidden_spy and team=v_team.team;
    if v_spy_count<>1 then
      raise exception using errcode='P0001',message='phase_two_team_spy_missing';
    end if;
    if (select count(*) from clues c where c.active
        and c.team_scope=v_team.team
        and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null))<v_clue_count then
      raise exception using errcode='P0001',message='phase_two_team_clues_missing';
    end if;
    select coalesce(
      array_agg(s.id order by s.priority,s.level,s.created_at,s.id),
      '{}'::uuid[]
    ) into v_clue_ids
    from(
      select c.id,c.level,c.created_at,
        case when c.spy_guest_id=v_spy_id then 0 else 1 end priority
      from clues c
      where c.active and c.team_scope=v_team.team
        and (c.spy_guest_id=v_spy_id or c.spy_guest_id is null)
      order by priority,c.level,c.created_at,c.id
      limit v_clue_count
    ) s;
    insert into guest_clues(guest_id,clue_id,granted_by)
    select g.id,selected.id,p_actor
    from guests g
    cross join unnest(v_clue_ids) selected(id)
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null
      and g.team=v_team.team
    on conflict(guest_id,clue_id) do nothing;
    get diagnostics v_inserted=row_count;
    v_total_inserted:=v_total_inserted+v_inserted;
    v_team_result:=jsonb_build_object(
      'team',v_team.team,'rank',v_reported_rank,'score',v_team.score,
      'top_score',v_team.top_score,'first_place',v_first_place,
      'first_place_requires_positive_score',true,
      'clue_count',v_clue_count,'clue_ids',to_jsonb(v_clue_ids),
      'recipient_clue_rows_created',v_inserted
    );
    v_result:=v_result||jsonb_build_array(v_team_result);
    insert into audit_log(actor,action,target_type,target_id,details)
    values(
      p_actor,'phase_two.team_clues_settle','team',v_team.team,v_team_result
    );
  end loop;
  update game_state set
    team_clues_settled_at=now(),
    team_score_snapshot=(
      select jsonb_object_agg(expected.team,coalesce(t.total,0))
      from (values('海岛组'::text),('沙漠组'::text)) expected(team)
      left join(
        select team,sum(amount)::integer total
        from team_points_ledger
        where team in('海岛组','沙漠组')
        group by team
      ) t using(team)
    ),
    updated_at=now()
  where id=1;
  return jsonb_build_object(
    'already_settled',false,'teams',v_result,
    'ranking_rule','positive_top_score_joint_first',
    'recipient_clue_rows_created',v_total_inserted
  );
end;
$$;

-- Keep the story promise and the already-correct captain settlement predicate
-- aligned with the clue-ranking rule. Positive ties remain joint first, while
-- a non-positive top score has no first-place reward.
alter table tasks disable trigger guard_retired_and_official_task_catalog;
update tasks set
  description='第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；只要全场最高团队分大于 0，本队取得第一或并列第一时，你将获得 4 点个人积分。若两队都是 0 分，则没有第一名奖励。',
  verification_method='领航星身份可以公开；系统按最终团队积分自动结算。正分并列第一同样获奖，双方均为 0 分时不发第一名奖励。'
where mission_code='P2-GUIDE-001';
alter table tasks enable trigger guard_retired_and_official_task_catalog;

-- formal_wedding_catalog_ready() owns the same immutable catalogue contract.
-- Patch the registered tuple in the same migration so the runtime row and the
-- preflight assertion cannot silently drift apart.
do $catalog_patch$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=replace(
    v_definition,
    $old$'第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；如果本队最终排名第一，你将获得 4 点个人积分。','领航星身份可以公开；系统根据团队最终排名自动结算队长奖励。'$old$,
    $new$'第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；只要全场最高团队分大于 0，本队取得第一或并列第一时，你将获得 4 点个人积分。若两队都是 0 分，则没有第一名奖励。','领航星身份可以公开；系统按最终团队积分自动结算。正分并列第一同样获奖，双方均为 0 分时不发第一名奖励。'$new$
  );
  if v_updated=v_definition
      or position($needle$只要全场最高团队分大于 0$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='formal_catalog_guiding_star_copy_patch_failed';
  end if;
  execute v_updated;
end;
$catalog_patch$;

create or replace function deactivate_game_clue(p_clue_id uuid,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_title text;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if v_state.results_published_at is not null
      or exists(select 1 from result_rewards) then
    raise exception using errcode='P0001',message='final_results_locked';
  end if;
  if v_state.team_clues_settled_at is not null and exists(
    select 1 from audit_log a
    where a.action='phase_two.team_clues_settle'
      and coalesce(a.details->'clue_ids','[]'::jsonb) ? p_clue_id::text
      and a.created_at>coalesce(
        (select max(r.created_at) from audit_log r where r.action='rehearsal.reset'),
        '-infinity'::timestamptz
      )
  ) then
    raise exception using errcode='P0001',message='settled_clue_locked';
  end if;
  update clues set active=false
  where id=p_clue_id and active
  returning title into v_title;
  if not found then
    raise exception using errcode='P0002',message='clue_not_found';
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'clue.deactivate','clue',p_clue_id::text,
    jsonb_build_object('title',v_title,'existing_guest_grants_preserved',true));
end;
$$;

-- Defence in depth for direct service-role table writes. Rehearsal reset sets
-- wedding.rehearsal_reset=on and remains the only path allowed to remove or
-- deactivate a clue that has already been delivered.
create or replace function guard_granted_clue_content()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if current_setting('wedding.rehearsal_reset',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if exists(select 1 from guest_clues where clue_id=old.id) then
    if tg_op='DELETE' then
      raise exception using errcode='P0001',message='granted_clue_content_locked';
    end if;
    if new.title is distinct from old.title
        or new.content is distinct from old.content
        or new.group_name is distinct from old.group_name
        or new.team_scope is distinct from old.team_scope
        or new.spy_guest_id is distinct from old.spy_guest_id then
      raise exception using errcode='P0001',message='granted_clue_content_locked';
    end if;
    if old.active and not new.active then
      raise exception using errcode='P0001',message='settled_clue_locked';
    end if;
  end if;
  return new;
end;
$$;

-- The unscoped approval primitive is an internal implementation detail. A
-- late compatibility migration accidentally restored service-role EXECUTE;
-- the application must use the run-scoped, audited wrapper instead.
revoke all on function approve_assignment(uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function approve_assignment_with_verification_for_run(
  uuid,text,text,uuid
) to service_role;

do $$
begin
  if has_function_privilege(
      'service_role','public.approve_assignment(uuid,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.approve_assignment(uuid,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.approve_assignment(uuid,text,text)','EXECUTE'
    ) then
    raise exception using errcode='P0001',message='canonical_approval_acl_open';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.approve_assignment_with_verification_for_run(uuid,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception using errcode='P0001',message='run_scoped_approval_acl_missing';
  end if;
  if position(
    $gate$coalesce(v_top_team_score,0)>0$gate$
    in pg_get_functiondef(
      'public.settle_phase_two_copy_and_captain(text)'::regprocedure
    )
  )=0 then
    raise exception using errcode='P0001',message='captain_first_place_rule_drift';
  end if;
end;
$$;

revoke all on function complete_system_mission_before_final_lock(
  uuid,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function settle_phase_two_team_clues(text)
  from public,anon,authenticated,service_role;
revoke all on function deactivate_game_clue(uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function guard_granted_clue_content()
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140005','runtime.scoring_clue_consistency_closed',
  'game_state','1',jsonb_build_object(
    'forward_only',true,
    'canonical_approval_service_role_revoked',true,
    'system_completion_exact_official_task',true,
    'ranking_rule','positive_top_score_joint_first',
    'zero_zero_has_first_place',false,
    'settled_clues_remain_active_until_reset',true
  )
);

commit;
