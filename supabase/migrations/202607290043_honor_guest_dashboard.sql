-- Honor guests reveal their family card once, then continue into the shared game
-- dashboard. They can receive manually awarded personal points, but remain
-- excluded from secret missions, clues, roles, and team voting.
alter table guests add column if not exists special_card_revealed_at timestamptz;

update guests
set eligible_for_personal_score=true
where active and participation_mode='HONOR_GUEST';

create or replace function reveal_honor_special_card(p_guest_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_revealed_at timestamptz;
begin
  select * into v_guest from guests where id=p_guest_id and active for update;
  if not found then
    raise exception using errcode='P0002',message='guest_not_found';
  end if;
  if v_guest.claimed_at is null then
    raise exception using errcode='28000',message='guest_not_claimed';
  end if;
  if v_guest.participation_mode<>'HONOR_GUEST' then
    raise exception using errcode='22023',message='guest_not_honor_eligible';
  end if;

  if v_guest.special_card_revealed_at is null then
    v_revealed_at=now();
    update guests set special_card_revealed_at=v_revealed_at where id=p_guest_id;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('guest:'||p_guest_id::text,'guest.honor_card_revealed','guest',p_guest_id::text,
      jsonb_build_object('participation_mode','HONOR_GUEST'));
  else
    v_revealed_at=v_guest.special_card_revealed_at;
  end if;

  return v_revealed_at;
end;
$$;

revoke all on function reveal_honor_special_card(uuid) from public,anon,authenticated;
grant execute on function reveal_honor_special_card(uuid) to service_role;

-- Resetting a guest password or running the rehearsal reset should also restore
-- the first-time surprise experience without rewriting either reset routine.
create or replace function reset_honor_special_card_with_claim()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.claimed_at is not null and new.claimed_at is null then
    new.special_card_revealed_at=null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_honor_special_card_with_claim on guests;
create trigger reset_honor_special_card_with_claim
before update of claimed_at on guests
for each row execute function reset_honor_special_card_with_claim();

create or replace function enforce_secret_clue_guest_eligibility()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if not exists(select 1 from guests where id=new.guest_id and active and eligible_for_secret_role) then
    raise exception using errcode='P0001',message='guest_not_secret_clue_eligible';
  end if;
  return new;
end;
$$;

drop trigger if exists guest_clues_guest_eligibility_guard on guest_clues;
create trigger guest_clues_guest_eligibility_guard
before insert or update of guest_id on guest_clues
for each row execute function enforce_secret_clue_guest_eligibility();

create or replace function enforce_vote_participant_eligibility()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if not exists(select 1 from guests where id=new.voter_guest_id and active
    and participation_mode='ACTIVE_PLAYER' and drawn_at is not null) then
    raise exception using errcode='P0001',message='voter_not_game_eligible';
  end if;
  if not exists(select 1 from guests where id=new.target_guest_id and active
    and participation_mode='ACTIVE_PLAYER' and drawn_at is not null) then
    raise exception using errcode='P0001',message='target_not_game_eligible';
  end if;
  return new;
end;
$$;

drop trigger if exists votes_participant_eligibility_guard on votes;
create trigger votes_participant_eligibility_guard
before insert or update of voter_guest_id,target_guest_id on votes
for each row execute function enforce_vote_participant_eligibility();

revoke all on function reset_honor_special_card_with_claim() from public,anon,authenticated;
revoke all on function enforce_secret_clue_guest_eligibility() from public,anon,authenticated;
revoke all on function enforce_vote_participant_eligibility() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607290043','guest.honor_dashboard_enabled','guest_group','HONOR_GUEST',
  jsonb_build_object('personal_points',true,'secret_missions',false,'secret_clues',false));
