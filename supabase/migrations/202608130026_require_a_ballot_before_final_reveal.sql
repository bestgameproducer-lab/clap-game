-- Publishing the finale is irreversible. Merely opening and closing an empty
-- voting round must not be enough to reveal identities and freeze the wedding.
-- Require at least one server-recorded ballot in the current round; this still
-- lets the operator proceed when some guests are absent.

begin;

create or replace function guard_nonempty_current_vote_before_results()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.results_visible
      and not old.results_visible
      and not exists(
        select 1 from votes v where v.voting_round=new.voting_round
      ) then
    raise exception using errcode='P0001',message='no_votes_in_current_round';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_nonempty_current_vote_before_results on game_state;
create trigger guard_nonempty_current_vote_before_results
before update of results_visible on game_state
for each row execute function guard_nonempty_current_vote_before_results();

revoke all on function guard_nonempty_current_vote_before_results()
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130026','finale.nonempty_ballot_guarded','game_state','1',
  jsonb_build_object('current_round_required',true,'minimum_ballots',1));

commit;
