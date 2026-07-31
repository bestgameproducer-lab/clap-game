-- Final organizer-approved phase-one catalogue and allocations.
-- Runtime rows are preserved. Presets are changed only for cards not yet drawn.

begin;

insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,is_demo,
  story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments)
values('和认识很久终于见面的朋友合影','找到一位认识很久、今天终于线下见面的朋友，聊聊你们如何认识，然后一起合影。','上传合影、双方确认或工作人员确认。',2,'all','standard','task_round_1',true,false,'NONE','P1-SOCIAL-002','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',2)
on conflict(mission_code) do update set title=excluded.title,description=excluded.description,
  verification_method=excluded.verification_method,points=excluded.points,active=true,is_demo=false,
  mechanic=excluded.mechanic,score_policy=excluded.score_policy,assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,max_assignments=excluded.max_assignments;

update tasks set active=false
where stage='task_round_1' and coalesce(mission_code,'') not in(
  'P1-CER-001','P1-CER-002','P1-CER-003','P1-CER-004','P1-HEART-001','P1-STAR-001',
  'P1-SOCIAL-001','P1-SOCIAL-002','P1-BONUS-001','P1-TRICKSTER-001');

update tasks t set points=spec.points,max_assignments=spec.max_assignments,active=true,is_demo=false
from(values
  ('P1-CER-001',5,1),('P1-CER-002',3,2),('P1-CER-003',3,1),('P1-CER-004',3,1),
  ('P1-HEART-001',2,5),('P1-STAR-001',2,5),('P1-SOCIAL-001',2,2),
  ('P1-SOCIAL-002',2,2),('P1-BONUS-001',2,2),('P1-TRICKSTER-001',0,null::integer)
) spec(mission_code,points,max_assignments) where t.mission_code=spec.mission_code;

-- Retire the applause role and lock the two named cheerleaders and lucky stars.
update guests set story_role='NONE',ceremony_eligible=false
where drawn_at is null and story_role='APPLAUSE_STARTER';
update guests set story_role='GROOM_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='siran li';
update guests set story_role='BRIDE_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='moshuang xu';
update guests set story_role='NONE',ceremony_eligible=false,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name) in('feifei xie','luyi sun');

-- Both tricksters are now drawn randomly, one from each competitive team.
update guests set role='guest',role_locked=false,eligible_for_secret_role=true
where drawn_at is null and active and phase_two_eligible and story_role='NONE'
  and lower(login_name) not in('yirui zhang','feifei xie','luyi sun');
update guests set role='guest',role_locked=true,eligible_for_secret_role=false
where drawn_at is null and (story_role<>'NONE' or lower(login_name) in('yirui zhang','feifei xie','luyi sun'));

create or replace function draw_guest_card(p_guest_id uuid)
returns table(
  guest_team text,guest_role text,guest_story_role text,guest_hidden_role text,task_id uuid,task_title text,
  task_description text,task_verification_method text,task_points integer,card_drawn_at timestamptz
)
language plpgsql security definer set search_path=public as $$
declare
  v_guest guests%rowtype; v_role text; v_task tasks%rowtype; v_assignment assignments%rowtype;
  v_registration_open boolean; v_drawn_spies integer; v_drawn_guests integer;
  v_reserved_guests integer; v_hidden_task_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v3'));
  select registration_open into v_registration_open from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  select * into v_guest from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode='28000',message='guest_not_claimed'; end if;
  if v_guest.participation_mode<>'ACTIVE_PLAYER' or not v_guest.eligible_for_mission then
    raise exception using errcode='P0001',message='guest_not_mission_eligible';
  end if;
  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a where a.guest_id=v_guest.id and a.is_initial order by a.created_at limit 1;
    if not found then raise exception using errcode='P0001',message='draw_assignment_missing'; end if;
    select * into v_task from tasks where id=v_assignment.task_id;
    return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,
      v_task.description,v_task.verification_method,v_task.points,v_guest.drawn_at; return;
  end if;
  if not coalesce(v_registration_open,false) then raise exception using errcode='P0001',message='draw_registration_closed'; end if;
  if v_guest.team not in('家人组','海岛组','沙漠组') then raise exception using errcode='P0001',message='invalid_final_team'; end if;

  if v_guest.team='家人组' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or v_guest.role_locked then
    v_role:='guest';
  else
    select count(*) filter(where role='spy'),count(*) filter(where role='guest') into v_drawn_spies,v_drawn_guests
    from guests where drawn_at is not null and team=v_guest.team;
    select count(*) into v_reserved_guests from guests g where g.id<>v_guest.id and g.active and g.phase_two_eligible
      and g.drawn_at is null and g.team=v_guest.team
      and (g.story_role<>'NONE' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest'));
    select role_name into v_role from(
      select 'spy'::text role_name from generate_series(1,greatest(0,1-v_drawn_spies))
      union all select 'guest'::text from generate_series(1,greatest(0,9-v_drawn_guests-v_reserved_guests))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode='P0001',message='draw_role_capacity_full'; end if;
  end if;

  if v_guest.story_role<>'NONE' then
    select * into v_task from tasks where active and not is_demo and mission_code=case v_guest.story_role
      when 'OFFICIANT' then 'P1-CER-001' when 'RING_KEEPER' then 'P1-CER-002'
      when 'GROOM_CHEERLEADER' then 'P1-CER-003' when 'BRIDE_CHEERLEADER' then 'P1-CER-004'
      when 'HEART_HOLDER' then 'P1-HEART-001' when 'STAR_HOLDER' then 'P1-STAR-001' else null end limit 1;
  elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-BONUS-001' limit 1;
  elsif v_role='spy' then
    select * into v_task from tasks where active and not is_demo and mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') order by random() limit 1;
  else
    select * into v_task from tasks t where t.active and not t.is_demo and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
      and (select count(*) from assignments a join guests assigned_guest on assigned_guest.id=a.guest_id
        where a.task_id=t.id and a.is_initial and assigned_guest.role='guest')<2
      order by random() limit 1;
  end if;
  if not found then raise exception using errcode='P0001',message='draw_task_missing'; end if;

  update guests set role=v_role,drawn_at=now() where id=v_guest.id returning * into v_guest;
  insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_task.id,true) returning * into v_assignment;
  if v_guest.story_role in('HEART_HOLDER','STAR_HOLDER') then
    insert into symbol_pairing_assignments(guest_id,symbol,status)
    values(v_guest.id,case when v_guest.story_role='HEART_HOLDER' then 'HEART' else 'STAR' end,'AVAILABLE')
    on conflict(guest_id) do update set symbol=excluded.symbol,status='AVAILABLE',partner_guest_id=null,
      pending_relationship_id=null,finalized_at=null,updated_at=now();
  end if;
  if v_role='spy' then
    select id into v_hidden_task_id from tasks where mission_code='P1-TRICKSTER-001' and active and not is_demo;
    if v_hidden_task_id is null then raise exception using errcode='P0001',message='draw_task_missing'; end if;
    insert into assignments(guest_id,task_id,is_initial) values(v_guest.id,v_hidden_task_id,false)
    on conflict(guest_id,task_id) do nothing;
  end if;
  if v_task.mechanic='INSTANT_BONUS' then
    perform complete_system_mission(v_guest.id,'INSTANT_BONUS','system:instant-bonus','丘比特幸运星自动奖励');
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||v_guest.id::text,'guest.card_draw','guest',v_guest.id::text,jsonb_build_object(
    'team',v_guest.team,'role',v_role,'story_role',v_guest.story_role,'assignment_id',v_assignment.id,
    'mission_code',v_task.mission_code,'task_catalog_mode','phase-one-final'));
  return query select v_guest.team,v_guest.role,v_guest.story_role,v_guest.hidden_role,v_task.id,v_task.title,
    v_task.description,v_task.verification_method,v_task.points,v_guest.drawn_at;
end;
$$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;

do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.request_assignment_mutual_confirmation(uuid,uuid,text)'::regprocedure) into v_definition;
  v_definition:=regexp_replace(v_definition,
    $q$if\s+v_code\s*<>\s*'P1-SOCIAL-001'\s+then$q$,
    $q$if v_code not in('P1-SOCIAL-001','P1-SOCIAL-002') then$q$,'i');
  if position($q$P1-SOCIAL-002$q$ in v_definition)=0 then
    raise exception using errcode='P0001',message='mutual_confirmation_photo_update_incomplete';
  end if;
  execute v_definition;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310003','phase_one.final_assignment_model','game_state','1',jsonb_build_object(
  'family_cards',7,'official_tasks',10,'random_tricksters_per_team',1,'fixed_lucky_stars',2,
  'scored_photo_slots',4,'runtime_preserved',true));

commit;
