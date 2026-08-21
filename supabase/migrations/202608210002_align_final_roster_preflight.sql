-- Keep the database opening gate aligned with the organizer-approved final
-- competitive teams. The previous roster contract encoded the superseded
-- team split, so the UI checklist passed while set_registration_open() was
-- correctly blocked by the stricter database preflight.

begin;

create or replace function formal_wedding_roster_ready()
returns boolean language sql stable security definer set search_path=public as $$
  with expected(login_name,team,participation_mode,phase_two_eligible,
    eligible_for_mission,eligible_for_personal_score) as (values
    ('danying yang','家人组','HONOR_GUEST',false,false,true),
    ('liying jin','家人组','HONOR_GUEST',false,false,true),
    ('jianjun jin','家人组','HONOR_GUEST',false,false,true),
    ('xiaofeng jin','家人组','HONOR_GUEST',false,false,true),
    ('wei jin','家人组','HONOR_GUEST',false,false,true),
    ('huimin xu','家人组','HONOR_GUEST',false,false,true),
    ('gang yao','家人组','HONOR_GUEST',false,false,true),
    ('xingcheng jin','家人组','ACTIVE_PLAYER',false,true,true),
    ('andao chen','家人组','ACTIVE_PLAYER',false,true,true),
    ('ziyang jin','家人组','ACTIVE_PLAYER',false,true,true),
    ('fangzhou chen','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('yue liu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('zikun zheng','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('siran li','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('junheng liu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('yifan yu','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('zixi wang','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('qianyi wang','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('jialai jin','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('chulan fan','沙漠组','ACTIVE_PLAYER',true,true,true),
    ('huijie huang','海岛组','ACTIVE_PLAYER',true,true,true),
    ('yi ren','海岛组','ACTIVE_PLAYER',true,true,true),
    ('tianyi shi','海岛组','ACTIVE_PLAYER',true,true,true),
    ('feifei xie','海岛组','ACTIVE_PLAYER',true,true,true),
    ('wenli xu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('tang-ling yeh','海岛组','ACTIVE_PLAYER',true,true,true),
    ('yirui zhang','海岛组','ACTIVE_PLAYER',true,true,true),
    ('luyi sun','海岛组','ACTIVE_PLAYER',true,true,true),
    ('moshuang xu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('ruochen xu','海岛组','ACTIVE_PLAYER',true,true,true),
    ('zimin jin',null::text,'PRINCIPAL',false,false,false),
    ('anrong',null::text,'PRINCIPAL',false,false,false)
  ), fixed_cast(login_name,story_role) as (values
    ('yifan yu','OFFICIANT'),
    ('xingcheng jin','RING_KEEPER'),
    ('andao chen','RING_KEEPER')
  ), competitive_identity(login_name,role) as (values
    ('fangzhou chen','spy'),
    ('yue liu','guest'),
    ('zikun zheng','guest'),
    ('siran li','guest'),
    ('junheng liu','guest'),
    ('yifan yu','guest'),
    ('zixi wang','guest'),
    ('qianyi wang','guest'),
    ('jialai jin','guest'),
    ('chulan fan','guest'),
    ('huijie huang','spy'),
    ('yi ren','guest'),
    ('tianyi shi','guest'),
    ('feifei xie','guest'),
    ('wenli xu','guest'),
    ('tang-ling yeh','guest'),
    ('yirui zhang','guest'),
    ('luyi sun','guest'),
    ('moshuang xu','guest'),
    ('ruochen xu','guest')
  )
  select
    (select count(*) from expected)=32
    and (select count(*) from guests where active)=32
    and not exists(
      select 1 from expected e
      left join guests g on g.active and lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=e.login_name
      where g.id is null or not g.uses_app
        or (e.team is not null and g.team is distinct from e.team)
        or g.participation_mode is distinct from e.participation_mode
        or g.phase_two_eligible is distinct from e.phase_two_eligible
        or g.eligible_for_mission is distinct from e.eligible_for_mission
        or g.eligible_for_personal_score is distinct from e.eligible_for_personal_score
        or (e.team is not null and not g.team_locked)
    )
    and not exists(
      select 1 from guests g where g.active and not exists(
        select 1 from expected e
        where e.login_name=lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))
      )
    )
    and not exists(
      select 1 from competitive_identity e
      left join guests g on g.active
        and lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=e.login_name
      where g.id is null or g.role is distinct from e.role
        or (e.role='spy' and (not g.role_locked or g.is_hidden_spy))
    )
    and (select count(*) from guests where active and role='spy')=2
    and not exists(
      select 1 from fixed_cast e
      left join guests g on g.active and lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=e.login_name
      where g.id is null or g.story_role is distinct from e.story_role
        or not g.role_locked or g.eligible_for_secret_role or g.role<>'guest'
    )
    and not exists(
      select 1 from guests g where g.active and g.story_role<>'NONE'
        and (g.role='spy' or g.story_role not in(
          'OFFICIANT','RING_KEEPER','HEART_HOLDER','STAR_HOLDER'))
    )
    and (select count(*) from guests where active and story_role='OFFICIANT')=1
    and (select count(*) from guests where active and story_role='RING_KEEPER')=2
    and not exists(
      select 1 from guests where active
        and lower(regexp_replace(trim(login_name),'\s+',' ','g')) in('feifei xie','luyi sun','yirui zhang')
        and (not role_locked or eligible_for_secret_role or role<>'guest')
    );
$$;

-- The approved team move puts both fixed Super Lucky players on the island
-- team. Keep the first-act random draw compatible with the exclusive
-- second-act card contract by leaving exactly one Double Verdict candidate on
-- each team. The two bouquet recipients remain random inside the available
-- desert pool, while one ordinary first-act photo is reserved on each team;
-- this also preserves the no-repeat-photo rule for the three banquet cards.
do $draw_contract$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.draw_guest_card_before_final_lock(uuid)'::regprocedure
  ) into v_definition;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-HEART-001' and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-HEART-001'
        and (select count(*) from assignments team_assignment
          join guests team_guest on team_guest.id=team_assignment.guest_id
          join tasks team_task on team_task.id=team_assignment.task_id
          where team_assignment.is_initial and team_guest.phase_two_eligible
            and team_guest.team=v_guest.team
            and team_task.mission_code in('P1-HEART-001','P1-STAR-001'))<5
        and$new$
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='final_roster_heart_team_cap_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-STAR-001' and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-STAR-001'
        and (select count(*) from assignments team_assignment
          join guests team_guest on team_guest.id=team_assignment.guest_id
          join tasks team_task on team_task.id=team_assignment.task_id
          where team_assignment.is_initial and team_guest.phase_two_eligible
            and team_guest.team=v_guest.team
            and team_task.mission_code in('P1-HEART-001','P1-STAR-001'))<5
        and$new$
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='final_roster_star_team_cap_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001' and$old$,
    $new$(v_guest.phase_two_eligible and v_guest.team='沙漠组'
        and t.mission_code='P1-BOUQUET-001' and$new$
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='final_roster_bouquet_pool_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and
          (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id$old$,
    $new$(v_guest.phase_two_eligible
          and ((t.mission_code='P1-SOCIAL-001' and v_guest.team='海岛组')
            or (t.mission_code='P1-SOCIAL-002' and v_guest.team='沙漠组'))
          and (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id$new$
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='final_roster_photo_team_patch_failed';
  end if;

  if position($needle$team_task.mission_code in('P1-HEART-001','P1-STAR-001'))<5$needle$ in v_updated)=0
      or position($needle$v_guest.team='沙漠组'
        and t.mission_code='P1-BOUQUET-001'$needle$ in v_updated)=0
      or position($needle$t.mission_code='P1-SOCIAL-001' and v_guest.team='海岛组'$needle$ in v_updated)=0
      or position($needle$t.mission_code='P1-SOCIAL-002' and v_guest.team='沙漠组'$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='final_roster_draw_contract_incomplete';
  end if;
  execute v_updated;
end;
$draw_contract$;

revoke all on function formal_wedding_roster_ready()
  from public,anon,authenticated,service_role;

do $verify$
begin
  if not formal_wedding_roster_ready() then
    raise exception using errcode='P0001',message='final_roster_database_preflight_not_ready';
  end if;
end;
$verify$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608210002',
  'formal_roster.database_preflight_aligned',
  'game_state','1',
  jsonb_build_object(
    'approved_by','organizer',
    'desert_team_count',10,
    'island_team_count',10,
    'desert_spy','Fangzhou Chen',
    'island_spy','Huijie Huang',
    'exact_identity_contract',true,
    'relationship_roles_per_team',5,
    'double_verdict_candidate_per_team',1,
    'no_repeat_banquet_photo_preserved',true
  )
);

commit;
