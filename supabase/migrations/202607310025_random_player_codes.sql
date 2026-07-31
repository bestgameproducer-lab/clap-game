-- Replace sequential player numbers with short, readable random codes and rate
-- limit authenticated code-entry attempts. Guest IDs and all runtime records
-- remain unchanged.

begin;

create or replace function generate_readable_player_code()
returns text language plpgsql volatile security definer set search_path=public as $$
declare
  v_alphabet constant text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_candidate text;
  v_index integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-player-code-v2'));
  loop
    v_candidate:='';
    for v_index in 1..4 loop
      v_candidate:=v_candidate||substr(v_alphabet,1+floor(random()*length(v_alphabet))::integer,1);
    end loop;
    exit when v_candidate~'[A-Z]' and v_candidate~'[2-9]'
      and not exists(select 1 from guests where player_code=v_candidate);
  end loop;
  return v_candidate;
end;
$$;

create or replace function assign_readable_player_code()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if nullif(trim(coalesce(new.player_code,'')),'') is null then
    new.player_code:=generate_readable_player_code();
  else
    new.player_code:=upper(regexp_replace(new.player_code,'[[:space:]-]','','g'));
    if new.player_code!~'^[A-HJ-KM-NP-Z2-9]{4}$' or new.player_code!~'[A-Z]' or new.player_code!~'[2-9]' then
      raise exception using errcode='22023',message='invalid_player_code';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guests_assign_readable_player_code on guests;
create trigger guests_assign_readable_player_code
before insert or update of player_code on guests
for each row execute function assign_readable_player_code();

do $$
declare v_guest_id uuid;
begin
  for v_guest_id in select id from guests order by id loop
    update guests set player_code=generate_readable_player_code() where id=v_guest_id;
  end loop;
end;
$$;

alter table guests alter column player_code drop default;
alter table guests drop constraint if exists guests_player_code_format_check;
alter table guests add constraint guests_player_code_format_check check (
  player_code~'^[A-HJ-KM-NP-Z2-9]{4}$' and player_code~'[A-Z]' and player_code~'[2-9]'
);

create table if not exists player_code_attempt_throttles (
  guest_id uuid primary key references guests(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check(attempt_count between 0 and 1000),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table player_code_attempt_throttles enable row level security;
revoke all on player_code_attempt_throttles from public,anon,authenticated;

create or replace function consume_player_code_attempt(p_guest_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_row player_code_attempt_throttles%rowtype; v_now timestamptz:=now(); v_count integer;
begin
  if not exists(select 1 from guests where id=p_guest_id and active and claim_code_hash is not null) then
    raise exception using errcode='28000',message='guest_session_invalid';
  end if;
  insert into player_code_attempt_throttles(guest_id,window_started_at,attempt_count,updated_at)
  values(p_guest_id,v_now,1,v_now) on conflict(guest_id) do nothing;
  if found then return 0; end if;
  select * into v_row from player_code_attempt_throttles where guest_id=p_guest_id for update;
  if v_row.locked_until is not null and v_row.locked_until>v_now then
    return greatest(1,ceil(extract(epoch from v_row.locked_until-v_now))::integer);
  end if;
  if v_row.window_started_at<=v_now-interval '10 minutes' then
    update player_code_attempt_throttles set window_started_at=v_now,attempt_count=1,locked_until=null,updated_at=v_now
    where guest_id=p_guest_id;
    return 0;
  end if;
  v_count:=least(1000,v_row.attempt_count+1);
  if v_count>8 then
    update player_code_attempt_throttles set attempt_count=v_count,locked_until=v_now+interval '10 minutes',updated_at=v_now
    where guest_id=p_guest_id;
    return 600;
  end if;
  update player_code_attempt_throttles set attempt_count=v_count,locked_until=null,updated_at=v_now where guest_id=p_guest_id;
  return 0;
end;
$$;

create or replace function clear_player_code_attempt_throttle()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.claim_code_hash is not null and new.claim_code_hash is null then
    delete from player_code_attempt_throttles where guest_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists guests_clear_player_code_attempt_throttle on guests;
create trigger guests_clear_player_code_attempt_throttle
after update of claim_code_hash on guests
for each row execute function clear_player_code_attempt_throttle();

revoke all on function generate_readable_player_code() from public,anon,authenticated;
revoke all on function assign_readable_player_code() from public,anon,authenticated;
revoke all on function consume_player_code_attempt(uuid) from public,anon,authenticated;
revoke all on function clear_player_code_attempt_throttle() from public,anon,authenticated;
grant execute on function consume_player_code_attempt(uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310025','guest.player_codes_randomized','game_state','1',jsonb_build_object(
  'guest_ids_preserved',true,'runtime_records_preserved',true,'code_length',4,
  'ambiguous_characters_removed',true,'attempt_limit',8,'window_minutes',10));

commit;
