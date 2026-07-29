-- Invitation-gated, one-time guest claiming with revocable server-side sessions.
alter table game_state add column if not exists registration_open boolean not null default true;
alter table game_state add column if not exists stage text not null default 'registration';
alter table game_state add column if not exists invitation_code_hash text;

do $$ begin
  alter table game_state add constraint game_state_stage_check check (
    stage in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results')
  );
exception when duplicate_object then null;
end $$;

update game_state
set invitation_code_hash = coalesce(invitation_code_hash, crypt('LOVE2026', gen_salt('bf'))),
    registration_open = true,
    stage = 'registration',
    voting_open = false,
    results_visible = false,
    updated_at = now()
where id = 1;

alter table guests add column if not exists claim_code_hash text;
alter table guests add column if not exists claimed_at timestamptz;

update guests
set claim_code_hash = crypt(login_code, gen_salt('bf'))
where claim_code_hash is null and login_code is not null;

alter table guests alter column login_code drop not null;
update guests set login_code = null where claim_code_hash is not null;

create table if not exists guest_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guest_sessions_guest_active_idx
on guest_sessions (guest_id, expires_at) where revoked_at is null;

alter table guest_sessions enable row level security;

create or replace function registration_guest_list(p_invitation_code text)
returns table (id uuid, name text, team text, claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where game_state.id = 1;
  if not v_state.registration_open then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code, v_state.invitation_code_hash) <> v_state.invitation_code_hash then
    raise exception using errcode = '28000', message = 'invalid_invitation_code';
  end if;
  return query select g.id, g.name, g.team, g.claimed_at is not null from guests g order by g.name;
end;
$$;

revoke all on function registration_guest_list(text) from public, anon, authenticated;
grant execute on function registration_guest_list(text) to service_role;

create or replace function claim_guest_identity(
  p_invitation_code text,
  p_guest_id uuid,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (guest_id uuid, guest_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
begin
  select * into v_state from game_state where game_state.id = 1 for update;
  if not v_state.registration_open then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code, v_state.invitation_code_hash) <> v_state.invitation_code_hash then
    raise exception using errcode = '28000', message = 'invalid_invitation_code';
  end if;

  select * into v_guest from guests where id = p_guest_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  if v_guest.claimed_at is not null then raise exception using errcode = '23505', message = 'guest_already_claimed'; end if;
  if v_guest.claim_code_hash is null or crypt(p_claim_code, v_guest.claim_code_hash) <> v_guest.claim_code_hash then
    raise exception using errcode = '28000', message = 'invalid_claim_code';
  end if;

  update guests set claimed_at = now() where id = v_guest.id;
  insert into guest_sessions (guest_id, token_hash, expires_at) values (v_guest.id, p_token_hash, p_expires_at);
  return query select v_guest.id, v_guest.name;
end;
$$;

revoke all on function claim_guest_identity(text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_guest_identity(text, uuid, text, text, timestamptz) to service_role;

create or replace function reset_guest_claim(p_guest_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update guests set claimed_at = null where id = p_guest_id;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  update guest_sessions set revoked_at = now() where guest_id = p_guest_id and revoked_at is null;
  insert into audit_log (actor, action, target_type, target_id)
  values (p_actor, 'guest.claim_reset', 'guest', p_guest_id::text);
end;
$$;

revoke all on function reset_guest_claim(uuid, text) from public, anon, authenticated;
grant execute on function reset_guest_claim(uuid, text) to service_role;

create or replace function set_registration_open(p_value boolean, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update game_state set registration_open = p_value, updated_at = now() where id = 1;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.registration_open', 'game_state', '1', jsonb_build_object('value', p_value));
end;
$$;
revoke all on function set_registration_open(boolean, text) from public, anon, authenticated;
grant execute on function set_registration_open(boolean, text) to service_role;

create or replace function set_game_stage(p_stage text, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode = '22023', message = 'invalid_game_stage';
  end if;
  update game_state set stage = p_stage, updated_at = now() where id = 1;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'game_state.stage', 'game_state', '1', jsonb_build_object('stage', p_stage));
end;
$$;
revoke all on function set_game_stage(text, text) from public, anon, authenticated;
grant execute on function set_game_stage(text, text) to service_role;
