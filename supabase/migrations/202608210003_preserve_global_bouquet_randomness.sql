-- Keep both bouquet cards globally random after the final team preset. One
-- ordinary first-act photo remains reserved on each team regardless of draw
-- order. This guarantees an exclusive Double Verdict candidate per team and
-- lets the second-act allocator absorb both prior photo recipients before
-- banquet work.

begin;

do $draw_contract$
declare
  v_definition text;
  v_updated text;
  v_global_slot_guard text := $guard$and (
          exists(
            select 1 from assignments reserved_assignment
            join guests reserved_guest on reserved_guest.id=reserved_assignment.guest_id
            join tasks reserved_task on reserved_task.id=reserved_assignment.task_id
            where reserved_assignment.is_initial
              and reserved_guest.phase_two_eligible
              and reserved_guest.team=v_guest.team
              and reserved_guest.role='guest'
              and not reserved_guest.role_locked
              and reserved_task.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
          )
          or (select count(*) from guests reserved_guest
            where reserved_guest.active and reserved_guest.uses_app
              and reserved_guest.participation_mode='ACTIVE_PLAYER'
              and reserved_guest.eligible_for_mission
              and reserved_guest.phase_two_eligible
              and reserved_guest.team=v_guest.team
              and reserved_guest.drawn_at is null
              and reserved_guest.story_role='NONE'
              and reserved_guest.eligible_for_secret_role
              and not reserved_guest.role_locked)>1
        )
        and $guard$;
  v_team_cap text := $cap$and (select count(*) from assignments team_assignment
          join guests team_guest on team_guest.id=team_assignment.guest_id
          join tasks team_task on team_task.id=team_assignment.task_id
          where team_assignment.is_initial and team_guest.phase_two_eligible
            and team_guest.team=v_guest.team
            and team_task.mission_code in('P1-HEART-001','P1-STAR-001'))<5
        $cap$;
begin
  select pg_get_functiondef(
    'public.draw_guest_card_before_final_lock(uuid)'::regprocedure
  ) into v_definition;

  if position(v_team_cap in v_definition)=0 then
    raise exception using errcode='P0001',message='global_bouquet_symbol_cap_anchor_missing';
  end if;
  v_updated:=replace(v_definition,v_team_cap,'');
  if v_updated=v_definition or position(v_team_cap in v_updated)>0 then
    raise exception using errcode='P0001',message='global_bouquet_symbol_cap_removal_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and v_guest.team='沙漠组'
        and t.mission_code='P1-BOUQUET-001' and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001' and$new$
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='global_bouquet_pool_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-HEART-001'
        and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-HEART-001'
        $new$||v_global_slot_guard
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='global_bouquet_heart_reservation_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-STAR-001'
        and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-STAR-001'
        $new$||v_global_slot_guard
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='global_bouquet_star_reservation_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(
    v_definition,
    $old$(v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001' and$old$,
    $new$(v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001'
        $new$||v_global_slot_guard
  );
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='global_bouquet_team_photo_reservation_patch_failed';
  end if;

  if position($needle$(v_guest.phase_two_eligible and t.mission_code='P1-BOUQUET-001'$needle$ in v_updated)=0
      or position($needle$t.mission_code='P1-SOCIAL-001' and v_guest.team='海岛组'$needle$ in v_updated)=0
      or position($needle$t.mission_code='P1-SOCIAL-002' and v_guest.team='沙漠组'$needle$ in v_updated)=0
      or length(v_updated)-length(replace(v_updated,'reserved_guest.drawn_at is null',''))
        <>3*length('reserved_guest.drawn_at is null') then
    raise exception using errcode='P0001',message='global_bouquet_draw_contract_incomplete';
  end if;
  execute v_updated;
end;
$draw_contract$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608210003',
  'phase_one.global_bouquet_randomness_preserved',
  'tasks','P1-BOUQUET-001',
  jsonb_build_object(
    'bouquet_random_assignments',2,
    'competitive_team_restriction',false,
    'ordinary_photo_reserved_per_team',1,
    'double_verdict_candidate_per_team',true,
    'no_repeat_banquet_photo_preserved',true,
    'runtime_rows_changed',false
  )
);

commit;
