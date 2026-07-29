-- Revocable, server-authoritative staff sessions. Raw tokens are never stored.
create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table admin_sessions enable row level security;
revoke all on admin_sessions from public, anon, authenticated;
create index if not exists admin_sessions_active_idx
  on admin_sessions (expires_at) where revoked_at is null;

create or replace function create_admin_session(
  p_token_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if length(coalesce(p_token_hash,'')) <> 64 then
    raise exception using errcode='22023', message='invalid_admin_session_hash';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception using errcode='22023', message='invalid_admin_session_expiry';
  end if;
  insert into admin_sessions(token_hash,expires_at)
  values(p_token_hash,p_expires_at) returning id into v_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('shared-admin','admin_session.create','admin_session',v_id::text,
    jsonb_build_object('expires_at',p_expires_at));
  return v_id;
end;
$$;

create or replace function revoke_admin_session(
  p_token_hash text,
  p_actor text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  update admin_sessions set revoked_at=now()
  where token_hash=p_token_hash and revoked_at is null
  returning id into v_id;
  if v_id is null then return false; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'admin_session.revoke','admin_session',v_id::text,'{}'::jsonb);
  return true;
end;
$$;

revoke all on function create_admin_session(text,timestamptz) from public, anon, authenticated;
revoke all on function revoke_admin_session(text,text) from public, anon, authenticated;
grant execute on function create_admin_session(text,timestamptz) to service_role;
grant execute on function revoke_admin_session(text,text) to service_role;
