-- Password recovery must never behave like a partial rehearsal reset. Keep
-- every gameplay fact when an organizer only clears a guest's PIN and sessions.
-- The explicit rehearsal reset sets wedding.rehearsal_reset=on and remains the
-- sole path allowed to clear an honor guest's revealed-card state.

begin;

create or replace function reset_honor_special_card_with_claim()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.claimed_at is not null and new.claimed_at is null then
    if coalesce(current_setting('wedding.rehearsal_reset',true),'')='on' then
      new.special_card_revealed_at=null;
    else
      new.special_card_revealed_at=old.special_card_revealed_at;
    end if;
  end if;
  return new;
end;
$$;

commit;
