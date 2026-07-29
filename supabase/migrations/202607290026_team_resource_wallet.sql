-- Auditable Cupid-coin wallets for the resource-auction game. Resource balances
-- are operational counters and intentionally do not affect team points.
create table if not exists team_resources (
  team text primary key check (char_length(trim(team)) between 1 and 40),
  balance integer not null default 10 check (balance between 0 and 1000),
  updated_at timestamptz not null default now()
);

create table if not exists team_resource_ledger (
  id bigint generated always as identity primary key,
  team text not null references team_resources(team) on update cascade on delete restrict,
  amount integer not null check (amount between -100 and 100 and amount<>0),
  balance_after integer not null check (balance_after between 0 and 1000),
  reason text not null check (char_length(trim(reason)) between 1 and 200),
  event_key uuid not null unique,
  actor text not null check (char_length(actor) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table team_resources enable row level security;
alter table team_resource_ledger enable row level security;
revoke all on team_resources from public, anon, authenticated;
revoke all on team_resource_ledger from public, anon, authenticated;
create index if not exists team_resource_ledger_team_created_idx on team_resource_ledger(team,created_at desc);

insert into team_resources(team,balance)
select distinct team,10 from guests where nullif(trim(team),'') is not null
on conflict (team) do nothing;

create or replace function adjust_team_resources(
  p_team text,
  p_amount integer,
  p_reason text,
  p_event_key uuid,
  p_actor text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet team_resources%rowtype;
  v_existing team_resource_ledger%rowtype;
  v_new_balance integer;
begin
  if p_amount is null or p_amount=0 or p_amount not between -100 and 100 then
    raise exception using errcode='22023',message='invalid_resource_amount';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='resource_reason_required';
  end if;
  if p_event_key is null then raise exception using errcode='22023',message='resource_event_key_required'; end if;

  select * into v_existing from team_resource_ledger where event_key=p_event_key;
  if found then
    if v_existing.team<>p_team or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='resource_event_conflict';
    end if;
    return v_existing.balance_after;
  end if;

  insert into team_resources(team,balance)
  select p_team,10 where exists(select 1 from guests where team=p_team and active)
  on conflict (team) do nothing;
  select * into v_wallet from team_resources where team=p_team for update;
  if not found then raise exception using errcode='P0002',message='team_not_found'; end if;

  v_new_balance := v_wallet.balance + p_amount;
  if v_new_balance<0 then raise exception using errcode='P0001',message='insufficient_team_resources'; end if;
  if v_new_balance>1000 then raise exception using errcode='P0001',message='team_resources_limit'; end if;

  update team_resources set balance=v_new_balance,updated_at=now() where team=p_team;
  insert into team_resource_ledger(team,amount,balance_after,reason,event_key,actor)
  values (p_team,p_amount,v_new_balance,trim(p_reason),p_event_key,p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values (p_actor,'team.resources_adjust','team',p_team,
    jsonb_build_object('amount',p_amount,'balance_after',v_new_balance,'reason',trim(p_reason)));
  return v_new_balance;
exception when unique_violation then
  select * into v_existing from team_resource_ledger where event_key=p_event_key;
  if v_existing.team=p_team and v_existing.amount=p_amount and v_existing.reason=trim(p_reason) then
    return v_existing.balance_after;
  end if;
  raise exception using errcode='P0001',message='resource_event_conflict';
end;
$$;

revoke all on function adjust_team_resources(text,integer,text,uuid,text) from public, anon, authenticated;
grant execute on function adjust_team_resources(text,integer,text,uuid,text) to service_role;
