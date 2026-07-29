-- Persist only an opaque server-HMAC client fingerprint so the shared staff
-- password cannot be guessed indefinitely from one browser/device.
create table if not exists admin_login_throttles (
  attempt_key text primary key,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_login_throttles_key_check check (attempt_key ~ '^[0-9a-f]{64}$'),
  constraint admin_login_throttles_failure_check check (failure_count between 0 and 5)
);

create index if not exists admin_login_throttles_updated_idx
on admin_login_throttles(updated_at);
alter table admin_login_throttles enable row level security;
revoke all on table admin_login_throttles from public,anon,authenticated;

create or replace function record_admin_login_attempt(
  p_attempt_key text,
  p_password_valid boolean
) returns table(auth_status text,retry_after_seconds integer)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_throttle admin_login_throttles%rowtype;
  v_failures integer;
  v_retry integer;
begin
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_admin_attempt_key';
  end if;
  if p_password_valid is null then
    raise exception using errcode='22023',message='admin_password_result_required';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin-login:' || p_attempt_key));
  delete from admin_login_throttles where updated_at<now()-interval '1 day';
  select * into v_throttle from admin_login_throttles
  where attempt_key=p_attempt_key for update;

  if found and v_throttle.locked_until is not null and v_throttle.locked_until>now() then
    v_retry:=greatest(1,ceil(extract(epoch from (v_throttle.locked_until-now())))::integer);
    return query select 'rate_limited'::text,v_retry;
    return;
  end if;

  if p_password_valid then
    delete from admin_login_throttles where attempt_key=p_attempt_key;
    return query select 'ok'::text,0;
    return;
  end if;

  if not found or v_throttle.window_started_at<=now()-interval '10 minutes' then
    insert into admin_login_throttles(attempt_key,failure_count,window_started_at,locked_until,updated_at)
    values(p_attempt_key,1,now(),null,now())
    on conflict(attempt_key) do update set
      failure_count=1,window_started_at=now(),locked_until=null,updated_at=now();
    v_failures:=1;
  else
    v_failures:=least(5,v_throttle.failure_count+1);
    update admin_login_throttles set
      failure_count=v_failures,
      locked_until=case when v_failures>=5 then now()+interval '15 minutes' else null end,
      updated_at=now()
    where attempt_key=p_attempt_key;
  end if;

  if v_failures>=5 then
    return query select 'rate_limited'::text,900;
  else
    return query select 'invalid_credentials'::text,0;
  end if;
end;
$$;

revoke all on function record_admin_login_attempt(text,boolean) from public,anon,authenticated;
grant execute on function record_admin_login_attempt(text,boolean) to service_role;

