-- Closing registration blocks first-time PIN creation, but must not lock returning guests out of voting or results.
create or replace function registration_guest_list(p_invitation_code text)
returns table (id uuid,name text,team text,claimed boolean)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where game_state.id=1;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;

  return query
  select g.id,g.name,g.team,g.claim_code_hash is not null
  from guests g
  where g.active and (v_state.registration_open or g.claim_code_hash is not null)
  order by g.name;
end;
$$;

drop function if exists claim_guest_by_login(text,text,text,text,timestamptz,text);
create function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_attempt_key text
) returns table (
  guest_id uuid,
  guest_name text,
  account_created boolean,
  auth_status text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_throttle guest_login_throttles%rowtype;
  v_normalized_login text;
  v_account_created boolean:=false;
  v_failures integer;
  v_retry integer;
begin
  select * into v_state from game_state where game_state.id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.invitation_code_hash is null
    or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;
  if p_claim_code is null or p_claim_code !~ '^[0-9]{4}$' then
    raise exception using errcode='22023',message='invalid_claim_code';
  end if;
  if p_attempt_key is null or p_attempt_key !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='invalid_attempt_key';
  end if;

  v_normalized_login:=lower(regexp_replace(trim(p_login_name),'\s+',' ','g'));
  select * into v_guest from guests
  where active and lower(regexp_replace(trim(login_name),'\s+',' ','g'))=v_normalized_login
  for update;
  if not found then
    raise exception using errcode='P0002',message='invalid_login_name';
  end if;

  -- Registration controls only first-time account creation. Returning guests still authenticate normally.
  if v_guest.claim_code_hash is null then
    if not v_state.registration_open then
      raise exception using errcode='P0001',message='registration_closed';
    end if;
    update guests
    set claim_code_hash=crypt(p_claim_code,gen_salt('bf')),claimed_at=now()
    where id=v_guest.id;
    delete from guest_login_throttles where attempt_key=p_attempt_key;
    v_account_created:=true;
  else
    delete from guest_login_throttles where updated_at<now()-interval '1 day';
    insert into guest_login_throttles(attempt_key,guest_id)
    values(p_attempt_key,v_guest.id)
    on conflict(attempt_key) do nothing;

    select * into v_throttle from guest_login_throttles
    where attempt_key=p_attempt_key for update;

    if v_throttle.locked_until is not null and v_throttle.locked_until>now() then
      v_retry:=greatest(1,ceil(extract(epoch from (v_throttle.locked_until-now())))::integer);
      return query select null::uuid,null::text,false,'rate_limited'::text,v_retry;
      return;
    end if;

    if v_throttle.window_started_at<=now()-interval '10 minutes' then
      update guest_login_throttles set failure_count=0,window_started_at=now(),locked_until=null,updated_at=now()
      where attempt_key=p_attempt_key
      returning * into v_throttle;
    end if;

    if crypt(p_claim_code,v_guest.claim_code_hash)<>v_guest.claim_code_hash then
      v_failures:=least(5,v_throttle.failure_count+1);
      update guest_login_throttles set
        failure_count=v_failures,
        locked_until=case when v_failures>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
      where attempt_key=p_attempt_key;

      if v_failures>=5 then
        return query select null::uuid,null::text,false,'rate_limited'::text,900;
      else
        return query select null::uuid,null::text,false,'invalid_claim_code'::text,0;
      end if;
      return;
    end if;

    delete from guest_login_throttles where attempt_key=p_attempt_key;
    update guests set claimed_at=coalesce(claimed_at,now()) where id=v_guest.id;
  end if;

  insert into guest_sessions(guest_id,token_hash,expires_at)
  values(v_guest.id,p_token_hash,p_expires_at);
  return query select v_guest.id,v_guest.name,v_account_created,'ok'::text,0;
end;
$$;

revoke all on function registration_guest_list(text) from public,anon,authenticated;
revoke all on function claim_guest_by_login(text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function registration_guest_list(text) to service_role;
grant execute on function claim_guest_by_login(text,text,text,text,timestamptz,text) to service_role;
