-- Let each guest set a private PIN on first use and reuse it for later sign-ins.
alter table guests alter column claim_code_hash drop not null;

drop function if exists claim_guest_by_login(text, text, text, text, timestamptz);

create function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (guest_id uuid, guest_name text, account_created boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_normalized_login text;
  v_account_created boolean := false;
begin
  select * into v_state from game_state where game_state.id = 1 for update;
  if not v_state.registration_open then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;
  if v_state.invitation_code_hash is null
     or crypt(p_invitation_code, v_state.invitation_code_hash) <> v_state.invitation_code_hash then
    raise exception using errcode = '28000', message = 'invalid_invitation_code';
  end if;
  if p_claim_code !~ '^[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'invalid_claim_code';
  end if;

  v_normalized_login := lower(regexp_replace(trim(p_login_name), '\s+', ' ', 'g'));
  select * into v_guest
  from guests
  where lower(regexp_replace(trim(login_name), '\s+', ' ', 'g')) = v_normalized_login
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'invalid_login_name'; end if;

  if v_guest.claim_code_hash is null then
    update guests
    set claim_code_hash = crypt(p_claim_code, gen_salt('bf')), claimed_at = now()
    where id = v_guest.id;
    v_account_created := true;
  else
    if crypt(p_claim_code, v_guest.claim_code_hash) <> v_guest.claim_code_hash then
      raise exception using errcode = '28000', message = 'invalid_claim_code';
    end if;
    update guests set claimed_at = coalesce(claimed_at, now()) where id = v_guest.id;
  end if;

  insert into guest_sessions (guest_id, token_hash, expires_at)
  values (v_guest.id, p_token_hash, p_expires_at);
  return query select v_guest.id, v_guest.name, v_account_created;
end;
$$;

revoke all on function claim_guest_by_login(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_guest_by_login(text, text, text, text, timestamptz) to service_role;

create or replace function reset_guest_claim(p_guest_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update guests set claimed_at = null, claim_code_hash = null where id = p_guest_id;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  update guest_sessions set revoked_at = now() where guest_id = p_guest_id and revoked_at is null;
  insert into audit_log (actor, action, target_type, target_id)
  values (p_actor, 'guest.pin_reset', 'guest', p_guest_id::text);
end;
$$;

revoke all on function reset_guest_claim(uuid, text) from public, anon, authenticated;
grant execute on function reset_guest_claim(uuid, text) to service_role;
