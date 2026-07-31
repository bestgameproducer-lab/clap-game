-- Entering act two must not fail merely because some symbol holders did not
-- finish pairing during the ceremony. Preserve active pairs, reject unresolved
-- invitations, auto-match the remaining opposite halves, and leave one final
-- holder per symbol for the lonely/guiding role.

begin;

create or replace function finalize_phase_one_content(p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_symbol text;
  v_relationship_type text;
  v_mechanic text;
  v_alliance_role text;
  v_final_role text;
  v_total integer;
  v_paired integer;
  v_pending integer;
  v_pairs_needed integer;
  v_pair_index integer;
  v_rejected_pending integer:=0;
  v_auto_pairs integer:=0;
  v_cancelled integer;
  v_left_ids uuid[];
  v_right_ids uuid[];
  v_left uuid;
  v_right uuid;
  v_a uuid;
  v_b uuid;
  v_last uuid;
  v_relationship_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-one-finalize-v1'));
  if (select stage from game_state where id=1 for update)
      not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','group_game') then
    raise exception using errcode='P0001',message='phase_one_not_active';
  end if;

  foreach v_symbol in array array['HEART','STAR'] loop
    v_relationship_type:=case when v_symbol='HEART' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
    v_mechanic:=case when v_symbol='HEART' then 'HEART_MATCH' else 'STAR_MATCH' end;
    v_alliance_role:=case when v_symbol='HEART' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
    v_final_role:=case when v_symbol='HEART' then 'LONELY_CUPID' else 'GUIDING_STAR' end;

    select count(*)::integer,count(*) filter(where status='PAIRED')::integer,
      count(*) filter(where status='PENDING')::integer
    into v_total,v_paired,v_pending
    from symbol_pairing_assignments where symbol=v_symbol;

    if v_total<>5 then
      raise exception using errcode='P0001',message='symbol_pairing_count_invalid';
    end if;
    if v_paired not in (0,2,4) then
      raise exception using errcode='P0001',message='symbol_pairing_state_invalid';
    end if;

    if v_pending>0 then
      update player_relationships r set status='REJECTED'
      where r.relationship_type=v_relationship_type and r.status='PENDING'
        and exists(
          select 1 from symbol_pairing_assignments s
          where s.symbol=v_symbol and s.pending_relationship_id=r.id
        );
      get diagnostics v_pending=row_count;
      v_rejected_pending:=v_rejected_pending+v_pending;

      update symbol_pairing_assignments set status='AVAILABLE',partner_guest_id=null,
        pending_relationship_id=null,updated_at=now()
      where symbol=v_symbol and status='PENDING';
    end if;

    v_pairs_needed:=(4-v_paired)/2;
    if v_pairs_needed>0 then
      select array_agg(guest_id order by random()) into v_left_ids
      from symbol_pairing_assignments
      where symbol=v_symbol and status='AVAILABLE' and fragment_side='LEFT';
      select array_agg(guest_id order by random()) into v_right_ids
      from symbol_pairing_assignments
      where symbol=v_symbol and status='AVAILABLE' and fragment_side='RIGHT';

      if coalesce(array_length(v_left_ids,1),0)<v_pairs_needed
          or coalesce(array_length(v_right_ids,1),0)<v_pairs_needed then
        raise exception using errcode='P0001',message='symbol_fragment_distribution_invalid';
      end if;

      for v_pair_index in 1..v_pairs_needed loop
        v_left:=v_left_ids[v_pair_index];
        v_right:=v_right_ids[v_pair_index];
        if v_left::text<v_right::text then v_a:=v_left;v_b:=v_right;
        else v_a:=v_right;v_b:=v_left; end if;

        insert into player_relationships(
          relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status,activated_at
        ) values(v_relationship_type,v_a,v_b,true,true,'ACTIVE',now())
        on conflict(relationship_type,player_a_id,player_b_id) do update set
          player_a_confirmed=true,player_b_confirmed=true,status='ACTIVE',activated_at=now()
        returning id into v_relationship_id;

        update symbol_pairing_assignments set status='PAIRED',
          partner_guest_id=case when guest_id=v_a then v_b else v_a end,
          pending_relationship_id=null,finalized_at=now(),updated_at=now()
        where symbol=v_symbol and guest_id in(v_a,v_b) and status='AVAILABLE';
        if not found then
          raise exception using errcode='P0001',message='symbol_auto_pair_conflict';
        end if;

        update guests set unlocked_role=v_alliance_role where id in(v_a,v_b);
        insert into audit_log(actor,action,target_type,target_id,details)
        values(p_actor,'relationship.auto_activate','player_relationship',v_relationship_id::text,
          jsonb_build_object('relationship_type',v_relationship_type,'reason','phase_one_finalization',
            'mission_points_awarded',false));
        v_auto_pairs:=v_auto_pairs+1;
      end loop;
    end if;

    select guest_id into v_last from symbol_pairing_assignments
    where symbol=v_symbol and status='AVAILABLE' order by guest_id limit 1 for update;
    if not found then
      raise exception using errcode='P0001',message='symbol_final_player_missing';
    end if;
    update symbol_pairing_assignments set status='UNPAIRED_FINAL',partner_guest_id=null,
      pending_relationship_id=null,finalized_at=now(),updated_at=now() where guest_id=v_last;
    update guests set unlocked_role=v_final_role where id=v_last;
    perform complete_system_mission(v_last,v_mechanic,'system:phase-one-finalize',
      '第一阶段结束：最后一位图案玩家自动完成任务');

    if (select count(*) from symbol_pairing_assignments where symbol=v_symbol and status='PAIRED')<>4
        or (select count(*) from symbol_pairing_assignments where symbol=v_symbol and status='UNPAIRED_FINAL')<>1
        or exists(select 1 from symbol_pairing_assignments where symbol=v_symbol and status in('AVAILABLE','PENDING')) then
      raise exception using errcode='P0001',message='symbol_finalization_incomplete';
    end if;
  end loop;

  update assignments a set status='cancelled',cancelled_at=now(),rejection_reason=null
  from tasks t where t.id=a.task_id and t.stage='task_round_1' and t.category<>'ceremony'
    and a.status in('assigned','rejected');
  get diagnostics v_cancelled=row_count;
  update game_state set phase_one_completed_at=coalesce(phase_one_completed_at,now()),updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_one.finalize','game_state','1',jsonb_build_object(
    'cancelled_assignments',v_cancelled,'auto_pairs_created',v_auto_pairs,
    'pending_invitations_rejected',v_rejected_pending,'fallback_matching',true));
  return jsonb_build_object('cancelledAssignments',v_cancelled,'heartFinalized',true,'starFinalized',true,
    'autoPairsCreated',v_auto_pairs,'pendingInvitationsRejected',v_rejected_pending);
end;
$$;

revoke all on function finalize_phase_one_content(text) from public,anon,authenticated;
grant execute on function finalize_phase_one_content(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310026','phase_one.unmatched_symbol_fallback_added','game_state','1',jsonb_build_object(
  'existing_active_pairs_preserved',true,'pending_invites_rejected_on_finalize',true,
  'remaining_opposite_halves_auto_paired',true,'runtime_progress_preserved',true));

commit;
