-- A final unmatched HEART/STAR holder awakens into an act-two role but did not
-- complete the act-one pairing mission. Keep the two points for actual pairs
-- (including pairs created by the phase-one fallback) and never award them to
-- the one UNPAIRED_FINAL holder in each symbol pool.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_old text:=$old$    perform complete_system_mission(v_last,v_mechanic,'system:phase-one-finalize',
      '第一阶段结束：最后一位图案玩家自动完成任务');$old$;
  v_new text:=$new$    if not exists(
      select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_last and a.is_initial
        and t.mission_code=case when v_symbol='HEART'
          then 'P1-HEART-001' else 'P1-STAR-001' end
        and t.mechanic=v_mechanic and t.formal_allowed and t.active
    ) then
      raise exception using errcode='P0001',
        message='unmatched_symbol_assignment_missing';
    end if;

    with invalid_score as(
      select
        p.guest_id,p.amount,
        md5('unmatched-symbol-live-reversal:'||a.id::text)::uuid event_key
      from assignments a
      join tasks t on t.id=a.task_id
      join points_ledger p on p.assignment_id=a.id
      where a.guest_id=v_last and a.is_initial and a.status='approved'
        and t.mission_code=case when v_symbol='HEART'
          then 'P1-HEART-001' else 'P1-STAR-001' end
        and t.mechanic=v_mechanic and t.formal_allowed and t.active
        and p.amount>0
    ), reversed as(
      insert into points_ledger(guest_id,amount,reason,event_key,actor)
      select guest_id,-amount,
        '积分修正：落单图案玩家未完成第一轮配对',
        event_key,'system:phase-one-finalize'
      from invalid_score i
      where not exists(
        select 1 from points_ledger p where p.event_key=i.event_key
      )
      returning guest_id,amount
    ), totals as(
      select guest_id,sum(amount)::integer amount
      from reversed group by guest_id
    )
    update guests g set points=greatest(0,g.points+totals.amount)
    from totals where g.id=totals.guest_id;

    update assignments a set
      status='cancelled',cancelled_at=now(),approved_at=null,
      submitted_at=null,rejected_at=null,
      rejection_reason='落单图案玩家进入第二幕能力，不获得第一轮配对分',
      completion_rank=null,
      verification_note='落单图案玩家未完成第一轮配对',
      verified_by='system:phase-one-finalize',verified_at=now()
    from tasks t
    where a.guest_id=v_last and a.task_id=t.id and a.is_initial
      and t.mission_code=case when v_symbol='HEART'
        then 'P1-HEART-001' else 'P1-STAR-001' end
      and t.mechanic=v_mechanic and t.formal_allowed and t.active;
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'symbol.unpaired_finalize','guest',v_last::text,
      jsonb_build_object(
        'symbol',v_symbol,'unlocked_role',v_final_role,
        'phase_one_pairing_completed',false,'phase_one_points_awarded',0
      ));$new$;
begin
  select pg_get_functiondef(
    'public.finalize_phase_one_content(text)'::regprocedure
  ) into v_definition;

  if position('symbol.unpaired_finalize' in v_definition)=0 then
    v_updated:=replace(v_definition,v_old,v_new);
    if v_updated=v_definition
        or position('symbol.unpaired_finalize' in v_updated)=0
        or position('phase_one_points_awarded' in v_updated)=0
        or position('perform complete_system_mission(v_last,v_mechanic' in v_updated)>0 then
      raise exception using
        errcode='P0001',message='unmatched_symbol_no_score_patch_failed';
    end if;
    execute v_updated;
  elsif position('perform complete_system_mission(v_last,v_mechanic' in v_definition)>0 then
    raise exception using
      errcode='P0001',message='unmatched_symbol_no_score_patch_failed';
  end if;
end;
$migration$;

revoke all on function finalize_phase_one_content(text)
  from public,anon,authenticated,service_role;

-- Repair only the exact score rows produced by the retired bug. Keep the
-- original ledger row and add a deterministic negative correction so the
-- scoring audit trail remains complete. The event key makes a manual replay
-- idempotent.
do $reconcile$
declare
  v_row record;
  v_event_key uuid;
  v_reversed boolean;
begin
  perform set_config('wedding.rehearsal_reset','on',true);

  for v_row in
    select
      s.symbol,g.id as guest_id,a.id as assignment_id,p.amount,
      coalesce(pt.phase_one_points_snapshot,0) as phase_one_points_snapshot
    from symbol_pairing_assignments s
    join guests g on g.id=s.guest_id
    join assignments a on a.guest_id=g.id and a.is_initial
    join tasks t on t.id=a.task_id
    join points_ledger p on p.assignment_id=a.id
    left join phase_two_profiles pt on pt.guest_id=g.id
    where s.status='UNPAIRED_FINAL'
      and a.status='approved'
      and t.mission_code=case when s.symbol='HEART'
        then 'P1-HEART-001' else 'P1-STAR-001' end
      and p.amount=t.points
      and p.actor='system:phase-one-finalize'
      and p.reason='第一阶段结束：最后一位图案玩家自动完成任务'
  loop
    v_event_key:=md5(
      'unmatched-symbol-score-reversal:'||v_row.assignment_id::text
    )::uuid;
    v_reversed:=false;

    if not exists(
      select 1 from points_ledger where event_key=v_event_key
    ) then
      insert into points_ledger(
        guest_id,amount,reason,event_key,actor
      ) values(
        v_row.guest_id,-v_row.amount,
        '积分修正：落单图案玩家未完成第一轮配对',
        v_event_key,'migration:202608210005'
      );
      update guests set points=greatest(0,points-v_row.amount)
      where id=v_row.guest_id;
      update phase_two_profiles set
        phase_one_points_snapshot=greatest(
          0,phase_one_points_snapshot-v_row.amount
        ),updated_at=now()
      where guest_id=v_row.guest_id;
      v_reversed:=true;
    end if;

    update assignments set
      status='cancelled',cancelled_at=coalesce(cancelled_at,now()),
      approved_at=null,submitted_at=null,rejected_at=null,
      rejection_reason='落单图案玩家进入第二幕能力，不获得第一轮配对分',
      completion_rank=null,
      verification_note='落单图案玩家未完成第一轮配对',
      verified_by='migration:202608210005',verified_at=now()
    where id=v_row.assignment_id;

    insert into audit_log(actor,action,target_type,target_id,details)
    values(
      'migration:202608210005','symbol.unpaired_score_corrected',
      'assignment',v_row.assignment_id::text,
      jsonb_build_object(
        'guest_id',v_row.guest_id,'symbol',v_row.symbol,
        'points_reversed',case when v_reversed then v_row.amount else 0 end,
        'phase_one_points_snapshot_before',v_row.phase_one_points_snapshot,
        'assignment_cancelled',true,'runtime_stage_preserved',true
      )
    );
  end loop;

  perform set_config('wedding.rehearsal_reset','off',true);
end;
$reconcile$;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608210005','phase_one.unmatched_symbol_no_score',
  'game_state','1',jsonb_build_object(
    'paired_players_receive_two_points',true,
    'unpaired_final_players_receive_zero_points',true,
    'unpaired_act_two_roles_preserved',true,
    'existing_erroneous_scores_reversed_with_ledger',true,
    'runtime_stage_preserved',true
  )
);

commit;
