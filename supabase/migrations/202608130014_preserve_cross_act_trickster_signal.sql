-- The trickster signal is the one official first-round mission that remains
-- actionable through dinner and the team challenge.  Closing round one must
-- still retire every other unfinished non-ceremony task, including custom or
-- obsolete tasks that happen to share a similar title.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.finalize_phase_one_content(text)'::regprocedure)
  into v_definition;

  if position($already$and t.mission_code='P1-TRICKSTER-001'
        and t.formal_allowed and t.active and t.category='hidden'
        and t.mechanic='TRICKSTER_SIGNAL'$already$ in v_definition)=0 then
    -- 202608020001 already added a title-independent, but too broad, mission-code
    -- exclusion.  Accept that canonical predecessor as well as databases that
    -- have not received its dynamic patch, then replace either shape with the
    -- complete server-authoritative predicate below.
    v_updated:=replace(
      v_definition,
      $old$and t.category<>'ceremony'
    and a.status in('assigned','rejected') and t.mission_code<>'P1-TRICKSTER-001';$old$,
      $new$and t.category<>'ceremony'
    and not (
      t.mission_code='P1-TRICKSTER-001'
        and t.formal_allowed and t.active and t.category='hidden'
        and t.mechanic='TRICKSTER_SIGNAL'
        and exists(
          select 1 from guests g
          where g.id=a.guest_id and g.active and g.uses_app
            and g.participation_mode='ACTIVE_PLAYER'
            and g.drawn_at is not null and g.role='spy'
        )
    )
    and a.status in('assigned','rejected');$new$
    );
    v_updated:=replace(
      v_updated,
      $old$and t.category<>'ceremony'
    and a.status in('assigned','rejected');$old$,
      $new$and t.category<>'ceremony'
    and not (
      t.mission_code='P1-TRICKSTER-001'
        and t.formal_allowed and t.active and t.category='hidden'
        and t.mechanic='TRICKSTER_SIGNAL'
        and exists(
          select 1 from guests g
          where g.id=a.guest_id and g.active and g.uses_app
            and g.participation_mode='ACTIVE_PLAYER'
            and g.drawn_at is not null and g.role='spy'
        )
    )
    and a.status in('assigned','rejected');$new$
    );
    if v_updated=v_definition
        or position($needle$t.mission_code='P1-TRICKSTER-001'$needle$ in v_updated)=0 then
      raise exception using errcode='P0001',message='cross_act_trickster_finalize_patch_failed';
    end if;
    execute v_updated;
  end if;
end;
$migration$;

-- System completion must never resurrect an assignment deliberately retired
-- by phase finalization or a catalog migration.  The cross-act trickster task
-- now remains assigned, so only live workflow states are eligible here.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.complete_system_mission_before_final_lock(uuid,text,text,text)'::regprocedure
  ) into v_definition;

  if position($already$a.status in('assigned','rejected','submitted')$already$ in v_definition)=0 then
    v_updated:=replace(
      v_definition,
      $old$and t.mechanic=p_mechanic and a.status<>'approved'$old$,
      $new$and t.mechanic=p_mechanic
    and a.status in('assigned','rejected','submitted')$new$
    );
    if v_updated=v_definition
        or position($needle$a.status in('assigned','rejected','submitted')$needle$ in v_updated)=0 then
      raise exception using errcode='P0001',message='system_mission_live_status_patch_failed';
    end if;
    execute v_updated;
  end if;
end;
$migration$;

-- An earlier August repair could revive an operator-reassigned trickster row
-- because reassignments keep the reason in immutable audit metadata instead of
-- assignments.rejection_reason. Re-cancel those rows before the narrow repair.
with operator_reassigned as (
  update assignments a set
    status='cancelled',cancelled_at=coalesce(a.cancelled_at,now())
  from tasks t
  where t.id=a.task_id and t.mission_code='P1-TRICKSTER-001'
    and (
      a.replaced_by_assignment_id is not null
      or exists(
        select 1 from audit_log l
        where l.action='assignment.reassign'
          and l.details->>'previous_assignment_id'=a.id::text
      )
    )
    and a.status<>'cancelled'
  returning a.id,a.guest_id,a.replaced_by_assignment_id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130014','assignment.operator_reassignment_recancelled',
  'assignment',id::text,jsonb_build_object(
    'guest_id',guest_id,'replacement_assignment_id',replaced_by_assignment_id,
    'operator_reassignment_preserved',true
  )
from operator_reassigned;

-- Repair only assignments that the old broad phase-one finalizer cancelled.
-- Operator reassignment provenance remains untouched; published finales remain
-- immutable.
with repaired as (
  update assignments a set
    status='assigned',cancelled_at=null,rejection_reason=null
  from tasks t,guests g,game_state s
  where t.id=a.task_id and g.id=a.guest_id and s.id=1
    and a.status='cancelled' and a.rejection_reason is null
    and a.replaced_by_assignment_id is null
    and not exists(
      select 1 from audit_log l
      where l.action='assignment.reassign'
        and l.details->>'previous_assignment_id'=a.id::text
    )
    and t.mission_code='P1-TRICKSTER-001'
    and t.formal_allowed and t.active and t.stage='task_round_1'
    and t.category='hidden' and t.mechanic='TRICKSTER_SIGNAL'
    and g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
    and g.drawn_at is not null and g.role='spy'
    and s.stage in('task_round_2','banquet','group_game')
    and s.results_published_at is null
    and not exists(select 1 from result_rewards)
  returning a.id,a.guest_id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130014','assignment.cross_act_trickster_restored',
  'assignment',id::text,jsonb_build_object(
    'guest_id',guest_id,'mission_code','P1-TRICKSTER-001',
    'restored_status','assigned','operator_cancellations_preserved',true
  )
from repaired;

revoke all on function finalize_phase_one_content(text)
  from public,anon,authenticated,service_role;
revoke all on function complete_system_mission_before_final_lock(uuid,text,text,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130014','phase_one.cross_act_boundary_hardened','game_state','1',
  jsonb_build_object(
    'preserved_mission_code','P1-TRICKSTER-001',
    'preserved_only_for_drawn_active_tricksters',true,
    'all_other_unfinished_non_ceremony_phase_one_tasks_retired',true,
    'cancelled_system_missions_cannot_be_resurrected',true
  ));

commit;
