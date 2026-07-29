-- Append-only, audited roster import for pre-event spreadsheet or text preparation.
create or replace function import_guest_roster(p_rows jsonb,p_actor text)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row jsonb;
  v_count integer;
  v_registration_open boolean;
begin
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception using errcode='22023',message='guest_roster_import_invalid';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  select registration_open into v_registration_open from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_registration_open then
    raise exception using errcode='P0001',message='guest_roster_import_registration_open';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row)<>'object' or jsonb_typeof(v_row->'name')<>'string' or
       jsonb_typeof(v_row->'loginName')<>'string' or
       (v_row ? 'tableLabel' and jsonb_typeof(v_row->'tableLabel')<>'string') or
       nullif(trim(v_row->>'name'),'') is null or length(trim(v_row->>'name'))>120 or
       nullif(trim(v_row->>'loginName'),'') is null or length(trim(v_row->>'loginName'))>80 or
       length(trim(coalesce(v_row->>'tableLabel','')))>40 then
      raise exception using errcode='22023',message='guest_roster_import_invalid';
    end if;
  end loop;

  begin
    insert into guests(name,login_name,login_code,table_label,is_elder,ceremony_eligible,active,staff_notes)
    select trim(row_item->>'name'),trim(row_item->>'loginName'),null,
      trim(coalesce(row_item->>'tableLabel','')),false,false,true,''
    from jsonb_array_elements(p_rows) as row_item;
  exception when unique_violation then
    raise exception using errcode='23505',message='guest_roster_import_conflict';
  end;

  v_count:=jsonb_array_length(p_rows);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.roster_import','guest_roster','bulk',jsonb_build_object('imported_count',v_count));
  return v_count;
end;
$$;

revoke all on function import_guest_roster(jsonb,text) from public,anon,authenticated;
grant execute on function import_guest_roster(jsonb,text) to service_role;
