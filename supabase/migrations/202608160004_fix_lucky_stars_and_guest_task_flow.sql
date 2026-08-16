-- The two fixed first-act Cupid lucky stars keep that story in act two.
-- Feifei owns the primary SUPER_LUCKY card; Louise keeps her banquet task and
-- receives the same automatic lucky card as an additional, completed ability.
-- Existing production rows are repaired only while still in a reversible
-- pre-finale state and only when none of the reassigned manual work has begun.

begin;

do $repair_live_lucky_cast$
declare
  v_stage text;
  v_feifei guests%rowtype;
  v_louise guests%rowtype;
  v_previous_lucky phase_two_profiles%rowtype;
  v_feifei_profile phase_two_profiles%rowtype;
  v_feifei_assignment uuid;
  v_previous_lucky_assignment uuid;
  v_lucky_task uuid;
begin
  select stage into v_stage from game_state where id=1 for update;
  if v_stage in ('voting','results') then
    raise exception using errcode='P0001',message='fixed_lucky_cast_repair_after_finale_forbidden';
  end if;

  select * into v_feifei from guests where lower(login_name)='feifei xie' for update;
  select * into v_louise from guests where lower(login_name)='luyi sun' for update;
  if not found or v_feifei.id is null or v_louise.id is null then
    raise exception using errcode='P0002',message='fixed_lucky_cast_missing';
  end if;

  select * into v_feifei_profile from phase_two_profiles where guest_id=v_feifei.id for update;
  if not found then return; end if;

  select * into v_previous_lucky from phase_two_profiles
  where primary_mission='SUPER_LUCKY' for update;
  if not found then
    raise exception using errcode='P0002',message='previous_lucky_profile_missing';
  end if;

  if v_previous_lucky.guest_id<>v_feifei.id then
    if exists(
      select 1 from points_ledger l
      where l.guest_id=v_previous_lucky.guest_id
        and l.reason like '丘比特幸运星%'
        and l.amount<>0
    ) then
      raise exception using errcode='P0001',message='previous_lucky_nonzero_reward_requires_manual_review';
    end if;

    select a.id into v_feifei_assignment
    from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_feifei.id and a.status<>'cancelled'
      and t.stage='task_round_2' and t.mission_code<>'P2-LUCKY-001'
    for update of a;
    select a.id into v_previous_lucky_assignment
    from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_previous_lucky.guest_id and a.status<>'cancelled'
      and t.mission_code='P2-LUCKY-001'
    for update of a;
    if v_feifei_assignment is null or v_previous_lucky_assignment is null then
      raise exception using errcode='P0002',message='fixed_lucky_assignment_missing';
    end if;
    if exists(
      select 1 from assignments
      where id=v_feifei_assignment
        and (status<>'assigned' or completion_note<>'' or evidence_path is not null)
    ) then
      raise exception using errcode='P0001',message='fixed_lucky_manual_task_already_started';
    end if;

    perform set_config('wedding.rehearsal_reset','on',true);
    update assignments set guest_id=case
      when id=v_feifei_assignment then v_previous_lucky.guest_id
      else v_feifei.id end
    where id in(v_feifei_assignment,v_previous_lucky_assignment);

    update phase_two_profiles set
      primary_mission=v_feifei_profile.primary_mission,
      super_lucky=false,
      updated_at=now()
    where guest_id=v_previous_lucky.guest_id;
    update phase_two_profiles set
      primary_mission='SUPER_LUCKY',
      super_lucky=true,
      lucky_bonus_settled_at=null,
      updated_at=now()
    where guest_id=v_feifei.id;
  end if;

  perform set_config('wedding.rehearsal_reset','on',true);
  update phase_two_profiles set
    super_lucky=(guest_id in(v_feifei.id,v_louise.id)),
    lucky_bonus_settled_at=case
      when guest_id in(v_feifei.id,v_louise.id) then null
      else lucky_bonus_settled_at end,
    updated_at=now()
  where super_lucky or guest_id in(v_feifei.id,v_louise.id);

  select id into v_lucky_task from tasks
  where mission_code='P2-LUCKY-001' and active and not is_demo;
  if v_lucky_task is null then
    raise exception using errcode='P0002',message='fixed_lucky_task_missing';
  end if;
  insert into assignments(guest_id,task_id)
  values(v_louise.id,v_lucky_task)
  on conflict(guest_id,task_id) do nothing;
end;
$repair_live_lucky_cast$;

create or replace function settle_phase_two_lucky(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
declare
  v_profile phase_two_profiles%rowtype;
  v_assignment_id uuid;
  v_initial_lucky boolean;
  v_awarded integer;
  v_total integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-two-lucky-settlement-v3'));
  for v_profile in
    select p.* from phase_two_profiles p join guests g on g.id=p.guest_id
    where p.super_lucky and lower(g.login_name) in('feifei xie','luyi sun')
    order by lower(g.login_name) for update of p
  loop
    if v_profile.unlocked_at is null or v_profile.lucky_bonus_settled_at is not null then
      continue;
    end if;
    select a.id into v_assignment_id from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=v_profile.guest_id and a.status<>'cancelled'
      and t.mission_code='P2-LUCKY-001' limit 1 for update of a;
    if v_assignment_id is null then
      raise exception using errcode='P0001',message='phase_two_assignment_missing';
    end if;
    select exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_profile.guest_id and a.is_initial and t.mission_code='P1-BONUS-001')
    into v_initial_lucky;
    if not v_initial_lucky then
      raise exception using errcode='P0001',message='fixed_lucky_origin_missing';
    end if;
    v_awarded:=greatest(coalesce(v_profile.phase_one_points_snapshot,0),0)+2;
    if v_awarded>0 then
      update guests set points=points+v_awarded where id=v_profile.guest_id;
      insert into points_ledger(guest_id,assignment_id,amount,reason,actor)
      values(v_profile.guest_id,v_assignment_id,v_awarded,
        '丘比特幸运星 · 第一阶段积分翻倍并追加幸运奖励',p_actor);
    end if;
    update phase_two_profiles set lucky_bonus_settled_at=now(),updated_at=now()
    where guest_id=v_profile.guest_id;
    update assignments set status='approved',approved_at=coalesce(approved_at,now()),
      verified_at=coalesce(verified_at,now()),verification_note='第二阶段开启时已由系统立即结算'
    where id=v_assignment_id and status<>'approved';
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.lucky_settle','guest',v_profile.guest_id::text,jsonb_build_object(
      'snapshot_points',v_profile.phase_one_points_snapshot,'initial_lucky_bonus',2,
      'awarded',v_awarded,'fixed_first_act_lucky',true,'settled_immediately',true));
    v_total:=v_total+v_awarded;
  end loop;
  return v_total;
end;
$$;

revoke all on function settle_phase_two_lucky(text) from public,anon,authenticated;
grant execute on function settle_phase_two_lucky(text) to service_role;

do $patch_future_allocator$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.unlock_phase_two_missions_assignments_v1(text)'::regprocedure)
  into v_definition;

  v_updated:=replace(v_definition,
    $old$    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
  order by exists(
    select 1 from assignments a join tasks t on t.id=a.task_id
    where a.guest_id=g.id and a.is_initial
      and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
  ) desc,random()
  limit 1;
  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;$old$,
    $new$    and lower(g.login_name)='feifei xie'
    and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id);
  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;$new$
  );

  v_updated:=replace(v_updated,
    $old$      and not exists(
        select 1 from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=g.id and a.is_initial
          and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
      )
  ), missions(position,primary_mission,interaction_theme) as (values$old$,
    $new$  ), missions(position,primary_mission,interaction_theme) as (values$new$
  );

  v_updated:=replace(v_updated,
    $old$      or exists(
        select 1 from phase_two_profiles p
        where p.primary_mission in(
          'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'
        ) and exists(
          select 1 from assignments a join tasks t on t.id=a.task_id
          where a.guest_id=p.guest_id and a.is_initial
            and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
        )
      )$old$,
    $new$$new$
  );

  v_updated:=replace(v_updated,
    $old$  if exists(
    select 1 from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
      and exists(
        select 1 from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=g.id and a.is_initial
          and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
      )
  ) then
    raise exception using errcode='P0001',message='phase_two_photo_absorption_incomplete';
  end if;

  -- The four photography missions are assigned only to the remaining players$old$,
    $new$  -- The four banquet missions cover the remaining players.$new$
  );

  v_updated:=replace(v_updated,
    $old$  if v_task_count<>20 then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;

  update phase_two_profiles set unlocked_at=now(),updated_at=now() where true;$old$,
    $new$  if v_task_count<>20 then
    raise exception using errcode='P0001',message='phase_two_assignment_count_invalid';
  end if;

  update phase_two_profiles p set super_lucky=true,updated_at=now()
  from guests g where g.id=p.guest_id and lower(g.login_name)='luyi sun';
  if (select count(*) from phase_two_profiles p join guests g on g.id=p.guest_id
      where p.super_lucky and lower(g.login_name) in('feifei xie','luyi sun'))<>2 then
    raise exception using errcode='P0001',message='fixed_lucky_cast_invalid';
  end if;
  insert into assignments(guest_id,task_id)
  select g.id,t.id from guests g join tasks t on t.mission_code='P2-LUCKY-001'
  where lower(g.login_name)='luyi sun' and t.active and not t.is_demo
  on conflict(guest_id,task_id) do nothing;
  if not found then
    raise exception using errcode='P0001',message='fixed_lucky_secondary_assignment_missing';
  end if;
  v_task_count:=v_task_count+1;

  update phase_two_profiles set unlocked_at=now(),updated_at=now() where true;$new$
  );

  if v_updated=v_definition
      or position($needle$lower(g.login_name)='feifei xie'$needle$ in v_updated)=0
      or position($needle$fixed_lucky_secondary_assignment_missing$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='fixed_lucky_allocator_patch_failed';
  end if;
  execute v_updated;
end;
$patch_future_allocator$;

create or replace function phase_two_official_assignment_set_complete()
returns boolean language plpgsql volatile security definer set search_path=public as $$
begin
  if (select count(*) from phase_two_profiles)<>20
      or (select count(*) from phase_two_profiles where unlocked_at is not null)<>20
      or (select count(*) from phase_two_profiles where team='海岛组')<>10
      or (select count(*) from phase_two_profiles where team='沙漠组')<>10
      or (select count(*) from phase_two_profiles where primary_mission='TOAST_GROOM_FATHER')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TOAST_BRIDE_MOTHER')<>1
      or (select count(*) from phase_two_profiles where primary_mission='INTERACT_WITH_GROOM')<>1
      or (select count(*) from phase_two_profiles where primary_mission='INTERACT_WITH_BRIDE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='DINNER_SPEECH')<>1
      or (select count(*) from phase_two_profiles where primary_mission='HEART_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='STAR_DILEMMA')<>4
      or (select count(*) from phase_two_profiles where primary_mission='COPY_SCORE')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TEAM_CAPTAIN')<>1
      or (select count(*) from phase_two_profiles where primary_mission='TRICKSTER')<>2
      or (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2
      or (select count(*) from phase_two_profiles where primary_mission='SUPER_LUCKY')<>1
      or (select count(*) from phase_two_profiles where is_captain)<>1 then return false;
  end if;
  if exists(
    select 1 from phase_two_profiles p join guests g on g.id=p.guest_id
    where p.super_lucky is distinct from (lower(g.login_name) in('feifei xie','luyi sun'))
      or p.extra_vote is distinct from (p.primary_mission='EXTRA_VOTE')
      or p.is_captain is distinct from (p.primary_mission='TEAM_CAPTAIN')
  ) then return false; end if;
  if (select count(*) from assignments a join tasks t on t.id=a.task_id
      where a.status<>'cancelled' and t.active and not t.is_demo
        and t.stage='task_round_2' and t.mission_code like 'P2-%')<>21 then return false;
  end if;
  if exists(
    select 1 from phase_two_profiles p join guests g on g.id=p.guest_id
    left join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
    left join tasks t on t.id=a.task_id and t.active and not t.is_demo
      and t.stage='task_round_2' and t.mission_code like 'P2-%'
    group by p.guest_id,p.primary_mission,g.login_name
    having count(*) filter(where t.mission_code=case p.primary_mission
      when 'TOAST_GROOM_FATHER' then 'P2-SOCIAL-001'
      when 'TOAST_BRIDE_MOTHER' then 'P2-SOCIAL-002'
      when 'INTERACT_WITH_GROOM' then 'P2-SOCIAL-003'
      when 'INTERACT_WITH_BRIDE' then 'P2-SOCIAL-004'
      when 'DINNER_SPEECH' then 'P2-CEREMONY-001'
      when 'HEART_DILEMMA' then 'P2-HEART-001'
      when 'STAR_DILEMMA' then 'P2-STAR-001'
      when 'COPY_SCORE' then 'P2-LONELY-001'
      when 'TEAM_CAPTAIN' then 'P2-GUIDE-001'
      when 'TRICKSTER' then 'P2-TRICKSTER-001'
      when 'EXTRA_VOTE' then 'P2-POWER-001'
      when 'SUPER_LUCKY' then 'P2-LUCKY-001' end)<>1
      or count(*) filter(where t.mission_code like 'P2-%')<>
        case when lower(g.login_name)='luyi sun' then 2 else 1 end
  ) then return false; end if;
  if not exists(
    select 1 from assignments a join tasks t on t.id=a.task_id join guests g on g.id=a.guest_id
    where a.status<>'cancelled' and t.mission_code='P2-LUCKY-001'
      and lower(g.login_name)='luyi sun'
  ) then return false; end if;
  return true;
end;
$$;

revoke all on function phase_two_official_assignment_set_complete()
  from public,anon,authenticated,service_role;

select settle_phase_two_lucky('migration:202608160004');

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608160004','phase_two.fixed_lucky_cast_repaired','game_state','1',jsonb_build_object(
  'fixed_lucky_logins',jsonb_build_array('feifei xie','luyi sun'),
  'secondary_lucky_assignment',true,
  'manual_banquet_tasks_preserved',true,
  'future_allocator_patched',true
));

commit;
