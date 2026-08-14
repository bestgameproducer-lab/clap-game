-- When act one closes, the server may create the remaining heart/star pairs so
-- the 5-player symbol pools always resolve to two alliances and one awakening
-- role. The older finalizer activated those fallback alliances but then
-- cancelled their still-assigned act-one missions. The final unmatched player
-- was system-completed, so the same fallback could award that player 2 points
-- while denying the four players whom the server had successfully paired.
--
-- Complete only the official, initial HEART_MATCH or STAR_MATCH assignment for
-- both members of each newly auto-created pair, before the general act-one
-- cleanup runs. complete_system_mission is already restricted to live workflow
-- states, is idempotent through assignment status plus the unique ledger key,
-- and does not allocate an early-completion rank. Existing approved players and
-- existing runtime rows are not rewritten by this migration.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.finalize_phase_one_content(text)'::regprocedure)
  into v_definition;

  if position($already$第一阶段结束：系统补齐图案伙伴$already$ in v_definition)=0 then
    v_updated:=replace(
      v_definition,
      $old$        update guests set unlocked_role=v_alliance_role where id in(v_a,v_b);
        insert into audit_log(actor,action,target_type,target_id,details)$old$,
      $new$        update guests set unlocked_role=v_alliance_role where id in(v_a,v_b);
        if exists(
          select 1 from assignments a join tasks t on t.id=a.task_id
          where a.guest_id=v_a and a.is_initial
            and a.status in('assigned','submitted','rejected')
            and t.mission_code=case when v_symbol='HEART' then 'P1-HEART-001' else 'P1-STAR-001' end
            and t.mechanic=v_mechanic and t.formal_allowed and t.active
        ) then
          perform complete_system_mission(v_a,v_mechanic,'system:phase-one-finalize',
            '第一阶段结束：系统补齐图案伙伴');
        end if;
        if exists(
          select 1 from assignments a join tasks t on t.id=a.task_id
          where a.guest_id=v_b and a.is_initial
            and a.status in('assigned','submitted','rejected')
            and t.mission_code=case when v_symbol='HEART' then 'P1-HEART-001' else 'P1-STAR-001' end
            and t.mechanic=v_mechanic and t.formal_allowed and t.active
        ) then
          perform complete_system_mission(v_b,v_mechanic,'system:phase-one-finalize',
            '第一阶段结束：系统补齐图案伙伴');
        end if;
        insert into audit_log(actor,action,target_type,target_id,details)$new$
    );
    if v_updated=v_definition
        or position($needle$a.guest_id=v_a and a.is_initial$needle$ in v_updated)=0
        or position($needle$a.guest_id=v_b and a.is_initial$needle$ in v_updated)=0
        or position($needle$perform complete_system_mission(v_a,v_mechanic$needle$ in v_updated)=0
        or position($needle$perform complete_system_mission(v_b,v_mechanic$needle$ in v_updated)=0 then
      raise exception using errcode='P0001',message='auto_pair_mission_completion_patch_failed';
    end if;
    execute v_updated;
  end if;
end;
$migration$;

revoke all on function finalize_phase_one_content(text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130034','phase_one.auto_pair_missions_complete',
  'game_state','1',jsonb_build_object(
    'future_auto_pairs_complete_both_assignments',true,
    'assignment_scope','official_initial_heart_or_star_only',
    'mission_points_awarded_once',true,
    'early_completion_rank_awarded',false,
    'existing_runtime_preserved',true
  ));

commit;
