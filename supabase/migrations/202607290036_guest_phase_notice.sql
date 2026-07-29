-- Give organizers an audited way to update the current instruction shown only on guest dashboards.
create or replace function set_guest_phase_note(p_note text,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_note text;
begin
  v_note:=trim(coalesce(p_note,''));
  if length(v_note)>500 then
    raise exception using errcode='22023',message='phase_note_too_long';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  update game_state set phase_note=nullif(v_note,''),updated_at=now() where id=1;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.phase_note','game_state','1',
    jsonb_build_object('cleared',v_note='','note_length',length(v_note)));
end;
$$;

revoke all on function set_guest_phase_note(text,text) from public,anon,authenticated;
grant execute on function set_guest_phase_note(text,text) to service_role;
