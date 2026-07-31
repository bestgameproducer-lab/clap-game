-- Allow an authenticated organizer to rotate the shared staff password without
-- storing plaintext. Until first rotation, the deployment environment remains authoritative.

begin;

create table if not exists admin_credential_override(
  singleton boolean primary key default true check(singleton),
  password_hash text not null check(char_length(password_hash)=60),
  updated_at timestamptz not null default now(),
  updated_by text not null
);
alter table admin_credential_override enable row level security;
revoke all on table admin_credential_override from public,anon,authenticated;

create or replace function verify_admin_password_override(p_password text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_hash text;
begin
  select password_hash into v_hash from admin_credential_override where singleton=true;
  if not found then return null; end if;
  return crypt(p_password,v_hash)=v_hash;
end;
$$;

create or replace function rotate_admin_password(p_password text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if char_length(p_password)<12 or char_length(p_password)>128 then
    raise exception using errcode='22023',message='admin_password_length_invalid';
  end if;
  if p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception using errcode='22023',message='admin_password_strength_invalid';
  end if;
  insert into admin_credential_override(singleton,password_hash,updated_at,updated_by)
  values(true,crypt(p_password,gen_salt('bf',12)),now(),p_actor)
  on conflict(singleton) do update set password_hash=excluded.password_hash,updated_at=now(),updated_by=excluded.updated_by;
  update admin_sessions set revoked_at=coalesce(revoked_at,now()) where revoked_at is null;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'admin_password.rotate','admin_credential','primary',jsonb_build_object(
    'all_sessions_revoked',true,'hash_algorithm','bcrypt'));
end;
$$;

revoke all on function verify_admin_password_override(text) from public,anon,authenticated;
revoke all on function rotate_admin_password(text,text) from public,anon,authenticated;
grant execute on function verify_admin_password_override(text) to service_role;
grant execute on function rotate_admin_password(text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310005','admin_password.rotation_enable','admin_credential','primary',jsonb_build_object(
  'plaintext_stored',false,'environment_fallback_preserved',true,'runtime_preserved',true));

commit;
