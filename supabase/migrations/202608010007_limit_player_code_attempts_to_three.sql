-- Limit authenticated player-code submissions without changing any player codes
-- or existing game records. The window remains short so staff can recover typos.
create or replace function consume_player_code_attempt(p_guest_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_row player_code_attempt_throttles%rowtype; v_now timestamptz:=now(); v_count integer;
begin
  if not exists(select 1 from guests where id=p_guest_id and active and claim_code_hash is not null) then
    raise exception using errcode='28000',message='guest_session_invalid';
  end if;
  insert into player_code_attempt_throttles(guest_id,window_started_at,attempt_count,updated_at)
  values(p_guest_id,v_now,1,v_now) on conflict(guest_id) do nothing;
  if found then return 0; end if;
  select * into v_row from player_code_attempt_throttles where guest_id=p_guest_id for update;
  if v_row.locked_until is not null and v_row.locked_until>v_now then
    return greatest(1,ceil(extract(epoch from v_row.locked_until-v_now))::integer);
  end if;
  if v_row.window_started_at<=v_now-interval '10 minutes' then
    update player_code_attempt_throttles set window_started_at=v_now,attempt_count=1,locked_until=null,updated_at=v_now
    where guest_id=p_guest_id;
    return 0;
  end if;
  v_count:=least(1000,v_row.attempt_count+1);
  if v_count>3 then
    update player_code_attempt_throttles set attempt_count=v_count,locked_until=v_now+interval '10 minutes',updated_at=v_now
    where guest_id=p_guest_id;
    return 600;
  end if;
  update player_code_attempt_throttles set attempt_count=v_count,locked_until=null,updated_at=v_now where guest_id=p_guest_id;
  return 0;
end;
$$;

revoke all on function consume_player_code_attempt(uuid) from public,anon,authenticated;
grant execute on function consume_player_code_attempt(uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608010007','guest.player_code_attempt_limit_updated','game_state','1',jsonb_build_object(
  'attempt_limit',3,'window_minutes',10,'player_codes_changed',false,'production_records_preserved',true));
