-- Let organizers replace the public example invitation code without exposing its plaintext.
alter table game_state add column if not exists invitation_code_updated_at timestamptz;

create or replace function set_invitation_code(p_code text,p_actor text)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_code text;
begin
  v_code:=upper(trim(coalesce(p_code,'')));
  if v_code !~ '^[A-Z0-9-]{6,32}$' then
    raise exception using errcode='22023',message='invalid_invitation_code_format';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  update game_state set
    invitation_code_hash=crypt(v_code,gen_salt('bf')),
    invitation_code_updated_at=now(),
    updated_at=now()
  where id=1;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.invitation_code_rotate','game_state','1',
    jsonb_build_object('code_length',length(v_code)));
end;
$$;

revoke all on function set_invitation_code(text,text) from public,anon,authenticated;
grant execute on function set_invitation_code(text,text) to service_role;
