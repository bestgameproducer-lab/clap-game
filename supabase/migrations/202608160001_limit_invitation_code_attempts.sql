begin;

-- The shared invitation code is intentionally distributed to guests, but the
-- public roster must not be enumerable through unlimited guesses. Persist only
-- a server-HMAC fingerprint; never retain a raw address, user agent, or code.
create table if not exists invitation_code_throttles (
  attempt_key text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint invitation_code_throttles_key_check check (attempt_key ~ '^[0-9a-f]{64}$'),
  constraint invitation_code_throttles_attempt_check check (attempt_count between 0 and 20)
);

create index if not exists invitation_code_throttles_updated_idx
on invitation_code_throttles(updated_at);

alter table invitation_code_throttles enable row level security;
revoke all on table invitation_code_throttles from public,anon,authenticated;

create or replace function consume_invitation_code_attempt(p_attempt_key text)
returns table(auth_status text,retry_after_seconds integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_throttle invitation_code_throttles%rowtype;
  v_attempts integer;
  v_retry integer;
begin
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_invitation_attempt_key';
  end if;

  perform pg_advisory_xact_lock(hashtext('invitation-code:' || p_attempt_key));
  delete from invitation_code_throttles where updated_at<now()-interval '1 day';

  insert into invitation_code_throttles(attempt_key)
  values(p_attempt_key)
  on conflict(attempt_key) do nothing;

  select * into v_throttle from invitation_code_throttles
  where attempt_key=p_attempt_key for update;

  if v_throttle.locked_until is not null and v_throttle.locked_until>now() then
    v_retry:=greatest(1,ceil(extract(epoch from (v_throttle.locked_until-now())))::integer);
    return query select 'rate_limited'::text,v_retry;
    return;
  end if;

  if v_throttle.window_started_at<=now()-interval '10 minutes' then
    v_attempts:=1;
    update invitation_code_throttles set
      attempt_count=1,window_started_at=now(),locked_until=null,updated_at=now()
    where attempt_key=p_attempt_key;
  else
    v_attempts:=least(20,v_throttle.attempt_count+1);
    update invitation_code_throttles set
      attempt_count=v_attempts,
      locked_until=case when v_attempts>=20 then now()+interval '15 minutes' else null end,
      updated_at=now()
    where attempt_key=p_attempt_key;
  end if;

  if v_attempts>=20 then
    return query select 'rate_limited'::text,900;
  else
    return query select 'ok'::text,0;
  end if;
end;
$$;

create or replace function clear_invitation_code_attempts(p_attempt_key text)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_invitation_attempt_key';
  end if;
  delete from invitation_code_throttles where attempt_key=p_attempt_key;
end;
$$;

revoke all on function consume_invitation_code_attempt(text) from public,anon,authenticated;
revoke all on function clear_invitation_code_attempts(text) from public,anon,authenticated;
grant execute on function consume_invitation_code_attempt(text) to service_role;
grant execute on function clear_invitation_code_attempts(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608160001','registration.invitation_throttle_enabled','game_state','1',
  jsonb_build_object('attempt_limit',20,'window_minutes',10,'lock_minutes',15,'raw_client_data_stored',false));

commit;
