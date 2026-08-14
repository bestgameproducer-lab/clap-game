-- P2-POWER-001 is a pure ability card: the guest has no submit action and the
-- voting RPC already derives its two-vote weight from the unlocked profile.
-- Leaving the assignment open until final reveal therefore creates an
-- impossible "pending" task. Mark the exact official ability assignment
-- complete in the same transaction that releases act two. The existing final
-- settlement remains an idempotent fallback for historical runtime rows.

begin;

create or replace function complete_phase_two_extra_vote_assignments(p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_completed integer:=0;
begin
  update assignments a
  set status='approved',
      approved_at=coalesce(a.approved_at,now()),
      submitted_at=coalesce(a.submitted_at,now()),
      verified_at=coalesce(a.verified_at,now()),
      verified_by=coalesce(a.verified_by,p_actor),
      verification_note='额外一票已解锁，最终投票自动按两票计算',
      rejection_reason=null
  from tasks t,phase_two_profiles p
  where a.task_id=t.id and a.guest_id=p.guest_id
    and a.status in('assigned','submitted','rejected')
    and t.mission_code='P2-POWER-001'
    and t.formal_allowed and t.active
    and t.mechanic='INSTANT_BONUS' and t.score_policy='NO_PERSONAL'
    and p.primary_mission='EXTRA_VOTE' and p.extra_vote
    and p.unlocked_at is not null;
  get diagnostics v_completed=row_count;

  if v_completed>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.extra_vote_assignments_complete','game_state','1',jsonb_build_object(
      'completed_assignments',v_completed,'mission_code','P2-POWER-001',
      'points_awarded',0,'completion_rank_awarded',false,'clues_awarded',0,
      'ability_effect','final ballot counts as two votes'
    ));
  end if;
  return v_completed;
end;
$$;

do $unlock_patch$
declare
  v_definition text;
  v_updated text;
  v_marker text:='perform complete_phase_two_extra_vote_assignments(p_actor);';
begin
  select pg_get_functiondef('public.unlock_phase_two_missions(text)'::regprocedure)
  into v_definition;

  if position(v_marker in v_definition)=0 then
    v_updated:=replace(
      v_definition,
      'perform settle_phase_two_lucky(p_actor);',
      'perform settle_phase_two_lucky(p_actor);'||chr(10)||'      perform complete_phase_two_extra_vote_assignments(p_actor);'
    );
    if v_updated=v_definition
        or (length(v_updated)-length(replace(v_updated,v_marker,'')))/length(v_marker)<>2 then
      raise exception using errcode='P0001',message='phase_two_extra_vote_unlock_patch_failed';
    end if;
    execute v_updated;
  end if;
end;
$unlock_patch$;

-- Keep the live task copy and the database registration contract identical to
-- the player-facing ability state.
alter table tasks disable trigger guard_retired_and_official_task_catalog;
update tasks set
  description='额外一票已解锁。最终投票时你仍只选择一名本队玩家，系统会自动将你的选择按两票计算；投票权重在身份揭晓前保密。',
  verification_method='第二阶段开启时由系统立即标记完成；最终投票自动按两票计算。'
where mission_code='P2-POWER-001';
alter table tasks enable trigger guard_retired_and_official_task_catalog;

do $catalog_patch$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=replace(
    v_definition,
    $old$'你拥有一次双重裁决：最终投票仍只选择一名本队玩家，但系统会将你的选择按两票计算。投票权重在身份揭晓前保密。','系统在最终投票时自动计算。'$old$,
    $new$'额外一票已解锁。最终投票时你仍只选择一名本队玩家，系统会自动将你的选择按两票计算；投票权重在身份揭晓前保密。','第二阶段开启时由系统立即标记完成；最终投票自动按两票计算。'$new$
  );
  if v_updated=v_definition
      or position($needle$额外一票已解锁。最终投票时你仍只选择一名本队玩家$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='formal_catalog_extra_vote_copy_patch_failed';
  end if;
  execute v_updated;
end;
$catalog_patch$;

revoke all on function complete_phase_two_extra_vote_assignments(text)
  from public,anon,authenticated,service_role;
revoke all on function unlock_phase_two_missions(text)
  from public,anon,authenticated;
grant execute on function unlock_phase_two_missions(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130035','phase_two.extra_vote_complete_on_unlock',
  'tasks','P2-POWER-001',jsonb_build_object(
    'future_unlocks_complete_immediately',true,
    'existing_final_settlement_fallback_preserved',true,
    'points_awarded',0,'completion_rank_awarded',false,'clues_awarded',0
  ));

commit;
