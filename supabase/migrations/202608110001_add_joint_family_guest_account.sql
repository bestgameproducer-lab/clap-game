-- Add Chen Tianran and Chen Ziyou as one shared family account with one
-- dedicated first-round mission. Existing wedding runtime data is preserved.

begin;

insert into tasks(
  title,description,verification_method,points,role_scope,category,stage,active,is_demo,
  story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments
)
values(
  '双人幸福留影',
  '这是陈天然和陈子宥共同完成的任务：请两个人一起拍一张开心的婚礼合影，留下今天的专属纪念。',
  '上传两人的婚礼合影，或向任务站工作人员出示照片。',
  2,'all','standard','task_round_1',true,false,
  'NONE','P1-FAMILY-001','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',1
)
on conflict(mission_code) do update set
  title=excluded.title,
  description=excluded.description,
  verification_method=excluded.verification_method,
  points=excluded.points,
  active=true,
  is_demo=false,
  mechanic=excluded.mechanic,
  score_policy=excluded.score_policy,
  assignment_mode=excluded.assignment_mode,
  verification_type=excluded.verification_type,
  max_assignments=excluded.max_assignments;

do $$
declare
  v_joint_id uuid;
  v_extra guests%rowtype;
  v_definition text;
  v_anchor text := $anchor$  elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then$anchor$;
  v_replacement text := $replacement$  elsif lower(v_guest.login_name)='tianran chen & ziyou chen' then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-FAMILY-001' limit 1;
  elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then$replacement$;
begin
  select id into v_joint_id
  from guests
  where lower(regexp_replace(trim(login_name),'\s+',' ','g'))='tianran chen & ziyou chen'
  order by active desc,created_at
  limit 1;

  if v_joint_id is null then
    select id into v_joint_id
    from guests
    where lower(regexp_replace(trim(login_name),'\s+',' ','g')) in('tianran chen','ziyou chen')
    order by case when lower(regexp_replace(trim(login_name),'\s+',' ','g'))='tianran chen' then 0 else 1 end,created_at
    limit 1;
  end if;

  if v_joint_id is null then
    insert into guests(name,login_name,login_code,team,role,points,active,staff_notes)
    values(
      '陈天然 & 陈子宥 Tianran Chen & Ziyou Chen',
      'Tianran Chen & Ziyou Chen',
      null,
      '家人组',
      'guest',
      0,
      true,
      '两位宾客共用一个账号；共同领取一项第一轮任务'
    ) returning id into v_joint_id;
  end if;

  for v_extra in
    select * from guests
    where id<>v_joint_id
      and lower(regexp_replace(trim(login_name),'\s+',' ','g')) in(
        'tianran chen','ziyou chen','tianran chen & ziyou chen'
      )
    for update
  loop
    if v_extra.claimed_at is not null
      or v_extra.drawn_at is not null
      or exists(select 1 from assignments where guest_id=v_extra.id)
      or exists(select 1 from points_ledger where guest_id=v_extra.id)
      or exists(select 1 from guest_sessions where guest_id=v_extra.id) then
      raise exception using errcode='P0001',message='joint_family_account_runtime_conflict';
    end if;
    update guests set
      active=false,
      uses_app=false,
      eligible_for_mission=false,
      eligible_for_secret_role=false,
      eligible_for_personal_score=false,
      phase_two_eligible=false,
      staff_notes='已合并至陈天然与陈子宥联合账号'
    where id=v_extra.id;
  end loop;

  if exists(
    select 1 from guests g
    where g.id=v_joint_id and (
      g.drawn_at is not null
      or exists(select 1 from assignments a where a.guest_id=g.id)
      or exists(select 1 from points_ledger p where p.guest_id=g.id)
    )
  ) then
    raise exception using errcode='P0001',message='joint_family_account_already_started';
  end if;

  update guests set
    name='陈天然 & 陈子宥 Tianran Chen & Ziyou Chen',
    login_name='Tianran Chen & Ziyou Chen',
    team='家人组',
    role='guest',
    team_locked=true,
    role_locked=true,
    is_hidden_spy=false,
    participation_mode='ACTIVE_PLAYER',
    relationship='家人',
    story_role='NONE',
    uses_app=true,
    eligible_for_mission=true,
    eligible_for_secret_role=false,
    eligible_for_personal_score=true,
    phase_two_eligible=false,
    special_card_title='',
    special_card_body='',
    is_elder=false,
    ceremony_eligible=false,
    active=true,
    staff_notes='两位宾客共用一个账号；共同领取一项第一轮任务'
  where id=v_joint_id;

  v_definition:=pg_get_functiondef('draw_guest_card(uuid)'::regprocedure);
  if position('P1-FAMILY-001' in v_definition)=0 then
    if position(v_anchor in v_definition)=0 then
      raise exception using errcode='P0001',message='draw_guest_card_patch_anchor_missing';
    end if;
    v_definition:=replace(v_definition,v_anchor,v_replacement);
    execute v_definition;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(
    'migration:202608110001',
    'guest.joint_family_account_added',
    'guest',
    v_joint_id::text,
    jsonb_build_object(
      'physical_guests',2,
      'login_accounts',1,
      'team','家人组',
      'mission_code','P1-FAMILY-001',
      'runtime_preserved',true
    )
  );
end;
$$;

commit;
