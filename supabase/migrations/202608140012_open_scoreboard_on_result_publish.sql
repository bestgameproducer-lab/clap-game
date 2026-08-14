-- Publishing final results opens the public scoreboard once. Operators may
-- close it afterwards, and closing it must actually hide the public payload.

begin;

create or replace function open_scoreboard_on_result_publish()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if coalesce(new.results_visible,false)
      and not coalesce(old.results_visible,false) then
    new.scoreboard_visible:=true;
  end if;
  return new;
end;
$$;

drop trigger if exists game_state_open_scoreboard_on_results on game_state;
create trigger game_state_open_scoreboard_on_results
before update of results_visible on game_state
for each row execute function open_scoreboard_on_result_publish();

revoke all on function open_scoreboard_on_result_publish() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608140012',
  'game_state.result_scoreboard_contract_hardened',
  'game_state',
  '1',
  jsonb_build_object(
    'result_publication_opens_scoreboard',true,
    'later_scoreboard_close_hides_public_payload',true
  )
);

commit;
