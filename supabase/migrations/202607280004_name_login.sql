-- Add private, human-readable login names without embedding guest PII in source control.
-- Real guest data is maintained directly in Supabase, outside the deployment bundle.
alter table guests add column if not exists login_name text;

create unique index if not exists guests_login_name_normalized_key
on guests ((lower(regexp_replace(trim(login_name), '\s+', ' ', 'g'))))
where login_name is not null;

create or replace function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (guest_id uuid, guest_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_normalized_login text;
begin
  select * into v_state from game_state where game_state.id = 1 for update;
  if not v_state.registration_open then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code, v_state.invitation_code_hash) <> v_state.invitation_code_hash then
    raise exception using errcode = '28000', message = 'invalid_invitation_code';
  end if;

  v_normalized_login := lower(regexp_replace(trim(p_login_name), '\s+', ' ', 'g'));
  select * into v_guest
  from guests
  where lower(regexp_replace(trim(login_name), '\s+', ' ', 'g')) = v_normalized_login
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'invalid_login_name'; end if;
  if v_guest.claimed_at is not null then raise exception using errcode = '23505', message = 'guest_already_claimed'; end if;

  update guests set claimed_at = now() where id = v_guest.id;
  insert into guest_sessions (guest_id, token_hash, expires_at)
  values (v_guest.id, p_token_hash, p_expires_at);
  return query select v_guest.id, v_guest.name;
end;
$$;

revoke all on function claim_guest_by_login(text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_guest_by_login(text, text, text, timestamptz) to service_role;
