-- Final publication is irreversible. Require operators to close the current
-- ballot explicitly before results_visible can move from false to true. The
-- existing non-empty-current-round rule remains part of the same trigger so
-- every publication path (admin, host or direct service RPC) has one atomic
-- database boundary.

begin;

create or replace function guard_nonempty_current_vote_before_results()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.results_visible and not old.results_visible then
    if old.voting_open or new.voting_open then
      raise exception using errcode='P0001',message='voting_still_open';
    end if;
    if not exists(
      select 1 from votes v where v.voting_round=new.voting_round
    ) then
      raise exception using errcode='P0001',message='no_votes_in_current_round';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function guard_nonempty_current_vote_before_results()
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608140003','finale.closed_ballot_guarded','game_state','1',
  jsonb_build_object(
    'current_round_required',true,
    'minimum_ballots',1,
    'voting_must_be_closed_before_publish',true
  ));

commit;
