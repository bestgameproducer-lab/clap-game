-- The two tricksters receive an ordinary photo facade plus their real hidden
-- mission. The earlier random facade choice could put both overlays on one
-- two-slot social task, so task metadata understated real assignment capacity.
-- Give one deterministic facade to each competitive team and make the two
-- official social capacities truthful at three assignments apiece.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.draw_guest_card_before_final_lock(uuid)'::regprocedure
  ) into v_definition;
  v_updated:=replace(
    v_definition,
    $old$select * into v_task from tasks where active and not is_demo and mission_code in('P1-SOCIAL-001','P1-SOCIAL-002') order by random() limit 1;$old$,
    $new$select * into v_task from tasks where active and not is_demo
      and mission_code=case when v_guest.team='海岛组' then 'P1-SOCIAL-001' else 'P1-SOCIAL-002' end
      limit 1;$new$
  );
  if v_updated=v_definition
      or position($needle$mission_code=case when v_guest.team='海岛组' then 'P1-SOCIAL-001' else 'P1-SOCIAL-002' end$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='trickster_facade_balance_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

-- Migrations are the only supported way to version official catalog fields.
-- Temporarily suspend the runtime immutability trigger for this exact update.
alter table tasks disable trigger guard_retired_and_official_task_catalog;
update tasks set max_assignments=3
where mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
  and max_assignments is distinct from 3;
alter table tasks enable trigger guard_retired_and_official_task_catalog;

-- The registration gate compares every official catalog field, so keep its
-- expected capacities in lockstep with the versioned task rows above.
do $catalog_gate$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=replace(
    replace(
      v_definition,
      $old$('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。',2,2,'all'$old$,
      $new$('P1-SOCIAL-001','和第一次见面的朋友合影','找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。','上传合影、双方确认或工作人员确认。',2,3,'all'$new$
    ),
    $old$('P1-SOCIAL-002','拍摄一张新郎新娘同框的照片','在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。','上传照片或向任务站工作人员出示照片。',2,2,'all'$old$,
    $new$('P1-SOCIAL-002','拍摄一张新郎新娘同框的照片','在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。','上传照片或向任务站工作人员出示照片。',2,3,'all'$new$
  );
  if v_updated=v_definition
      or position($needle$'上传合影、双方确认或工作人员确认。',2,3,'all'$needle$ in v_updated)=0
      or position($needle$'上传照片或向任务站工作人员出示照片。',2,3,'all'$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='formal_catalog_facade_capacity_patch_failed';
  end if;
  execute v_updated;
end;
$catalog_gate$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130017','phase_one.facade_capacity_balanced','tasks','P1-SOCIAL',
  jsonb_build_object(
    'normal_social_assignments',4,
    'trickster_facade_overlays',2,
    'social_001_capacity',3,
    'social_002_capacity',3,
    'facade_assignment','one_per_competitive_team',
    'hidden_trickster_assignments_non_initial',true
  ));

commit;
