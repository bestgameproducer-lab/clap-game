-- Align assignment_mode with the actual allocator contract. This field is
-- maintenance metadata only; task recipients, scores and assignment rows are
-- deliberately untouched.

begin;

alter table tasks disable trigger guard_retired_and_official_task_catalog;

do $task_modes$
declare v_count integer;
begin
  update tasks t
  set assignment_mode=expected.assignment_mode
  from (values
    ('P1-CER-001','FIXED'),
    ('P1-CER-002','FIXED'),
    ('P1-CER-003','FIXED'),
    ('P1-CER-004','FIXED'),
    ('P1-HEART-001','CONTROLLED_RANDOM'),
    ('P1-STAR-001','CONTROLLED_RANDOM'),
    ('P1-SOCIAL-001','CONTROLLED_RANDOM'),
    ('P1-SOCIAL-002','CONTROLLED_RANDOM'),
    ('P1-BONUS-001','FIXED'),
    ('P1-TRICKSTER-001','ROLE_FIXED'),
    ('P1-FAMILY-001','FIXED'),
    ('P2-SOCIAL-001','CONTROLLED_RANDOM'),
    ('P2-SOCIAL-002','CONTROLLED_RANDOM'),
    ('P2-SOCIAL-003','CONTROLLED_RANDOM'),
    ('P2-SOCIAL-004','CONTROLLED_RANDOM'),
    ('P2-CEREMONY-001','FIXED'),
    ('P2-HEART-001','RELATIONSHIP'),
    ('P2-STAR-001','RELATIONSHIP'),
    ('P2-LONELY-001','RELATIONSHIP'),
    ('P2-GUIDE-001','RELATIONSHIP'),
    ('P2-TRICKSTER-001','ROLE_FIXED'),
    ('P2-POWER-001','CONTROLLED_RANDOM'),
    ('P2-LUCKY-001','CONTROLLED_RANDOM')
  ) as expected(mission_code,assignment_mode)
  where t.mission_code=expected.mission_code;

  get diagnostics v_count=row_count;
  if v_count<>23 then
    raise exception using
      errcode='P0001',
      message='official_assignment_mode_catalog_incomplete',
      detail=format('expected 23 official tasks, matched %s',v_count);
  end if;
end;
$task_modes$;

alter table tasks enable trigger guard_retired_and_official_task_catalog;

-- formal_wedding_catalog_ready() contains the immutable expected catalog. Keep
-- its assignment-mode column synchronized without weakening any of its title,
-- copy, score, capacity or verification checks.
do $catalog_gate$
declare
  v_definition text;
  v_updated text;
  v_before text;
  v_row record;
  v_pattern text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=v_definition;

  for v_row in
    select * from (values
      ('P1-CER-001','MANUAL','FIXED','HOST_CONFIRM'),
      ('P1-CER-002','MANUAL','FIXED','HOST_CONFIRM'),
      ('P1-CER-003','CONTROLLED_RANDOM','FIXED','HOST_CONFIRM'),
      ('P1-CER-004','CONTROLLED_RANDOM','FIXED','HOST_CONFIRM'),
      ('P1-SOCIAL-001','RANDOM','CONTROLLED_RANDOM','PHOTO'),
      ('P1-BONUS-001','RANDOM','FIXED','SYSTEM_CONFIRM'),
      ('P1-TRICKSTER-001','RANDOM','ROLE_FIXED','MUTUAL_CONFIRM'),
      ('P1-FAMILY-001','CONTROLLED_RANDOM','FIXED','PHOTO'),
      ('P2-SOCIAL-001','FIXED','CONTROLLED_RANDOM','PHOTO'),
      ('P2-SOCIAL-002','FIXED','CONTROLLED_RANDOM','PHOTO'),
      ('P2-SOCIAL-003','FIXED','CONTROLLED_RANDOM','PHOTO'),
      ('P2-SOCIAL-004','FIXED','CONTROLLED_RANDOM','PHOTO'),
      ('P2-POWER-001','ROLE_FIXED','CONTROLLED_RANDOM','SYSTEM'),
      ('P2-LUCKY-001','ROLE_FIXED','CONTROLLED_RANDOM','SYSTEM')
    ) as changed(mission_code,old_mode,new_mode,verification_type)
  loop
    v_before:=v_updated;
    v_pattern:=format(
      $pattern$(\(%L[^\r\n]*,)\s*%L\s*(,\s*%L\s*,\s*true\s*,\s*false\s*,\s*false\s*\))$pattern$,
      v_row.mission_code,v_row.old_mode,v_row.verification_type
    );
    v_updated:=regexp_replace(
      v_updated,
      v_pattern,
      format(E'\\1%L\\2',v_row.new_mode)
    );
    if v_updated=v_before then
      raise exception using
        errcode='P0001',
        message='formal_catalog_assignment_mode_patch_failed',
        detail=v_row.mission_code;
    end if;
  end loop;

  execute v_updated;
end;
$catalog_gate$;

do $verify$
begin
  if not formal_wedding_catalog_ready() then
    raise exception using
      errcode='P0001',
      message='formal_catalog_assignment_mode_alignment_failed';
  end if;
end;
$verify$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140009',
  'task_catalog.assignment_modes_aligned',
  'task_catalog',
  'official-23',
  jsonb_build_object(
    'fixed_named_tasks',array[
      'P1-CER-001','P1-CER-002','P1-CER-003','P1-CER-004',
      'P1-BONUS-001','P1-FAMILY-001','P2-CEREMONY-001'
    ],
    'relationship_derived_tasks',array[
      'P2-HEART-001','P2-STAR-001','P2-LONELY-001','P2-GUIDE-001'
    ],
    'role_fixed_tasks',array['P1-TRICKSTER-001','P2-TRICKSTER-001'],
    'controlled_allocator_tasks',10,
    'assignment_rows_changed',false,
    'scores_changed',false
  )
);

commit;
