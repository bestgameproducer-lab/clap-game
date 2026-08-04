-- Make the trickster's extra ballot follow the completed true first-act mission.
-- The second act still controls when the acquired power becomes usable.

begin;

create or replace function cast_team_vote(p_voter_guest_id uuid,p_target_guest_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_voter_team text; v_target_team text; v_weight integer:=1; v_state game_state%rowtype;
begin
  if p_voter_guest_id=p_target_guest_id then raise exception using errcode='22023',message='self_vote'; end if;
  select * into v_state from game_state where id=1 for share;
  if not coalesce(v_state.voting_open,false) then raise exception using errcode='P0001',message='voting_closed'; end if;
  select team into v_voter_team from guests where id=p_voter_guest_id and active and drawn_at is not null;
  select team into v_target_team from guests where id=p_target_guest_id and active and drawn_at is not null;
  if v_voter_team is null or v_target_team is null then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_voter_team<>v_target_team then raise exception using errcode='22023',message='cross_team_vote'; end if;

  if exists(
      select 1 from phase_two_profiles
      where guest_id=p_voter_guest_id and primary_mission='EXTRA_VOTE' and unlocked_at is not null
    ) or exists(
      select 1
      from assignments a
      join tasks t on t.id=a.task_id
      join guests g on g.id=a.guest_id
      join phase_two_profiles p on p.guest_id=a.guest_id
      where a.guest_id=p_voter_guest_id
        and a.status='approved'
        and t.mission_code='P1-TRICKSTER-001'
        and g.role='spy'
        and p.primary_mission='TRICKSTER'
        and p.unlocked_at is not null
    ) or exists(
      select 1 from assignments a join tasks t on t.id=a.task_id join guests g on g.id=a.guest_id
      where a.guest_id=p_voter_guest_id and a.status='approved' and t.mission_code='P2-TRICKSTER-001' and g.role='spy'
    ) then
    v_weight:=2;
  end if;

  begin
    insert into votes(voter_guest_id,target_guest_id,voting_round,vote_weight)
    values(p_voter_guest_id,p_target_guest_id,v_state.voting_round,v_weight);
  exception when unique_violation then raise exception using errcode='P0001',message='vote_already_cast'; end;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_voter_guest_id::text,'vote.cast','vote',p_voter_guest_id::text,
    jsonb_build_object('target_id',p_target_guest_id,'voting_round',v_state.voting_round,'weighted',v_weight=2));
end;
$$;

create or replace function sync_completed_trickster_vote_weight()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_is_completed_trickster boolean := false;
  v_updated integer := 0;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  select exists(
    select 1
    from tasks t
    join guests g on g.id=new.guest_id
    left join phase_two_profiles p on p.guest_id=new.guest_id
    where t.id=new.task_id
      and g.role='spy'
      and (
        t.mission_code='P2-TRICKSTER-001'
        or (t.mission_code='P1-TRICKSTER-001' and p.primary_mission='TRICKSTER' and p.unlocked_at is not null)
      )
  ) into v_is_completed_trickster;

  if not v_is_completed_trickster then return new; end if;

  update votes set vote_weight=2
  where voter_guest_id=new.guest_id and vote_weight<>2;
  get diagnostics v_updated=row_count;

  if v_updated>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:trickster_vote_sync','vote.weight_upgraded','guest',new.guest_id::text,
      jsonb_build_object('assignment_id',new.id,'updated_ballots',v_updated,'vote_weight',2));
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_trickster_vote_weight_sync on assignments;
create trigger assignment_trickster_vote_weight_sync
after insert or update of status on assignments
for each row execute function sync_completed_trickster_vote_weight();

with eligible_voters as (
  select distinct a.guest_id
  from assignments a
  join tasks t on t.id=a.task_id
  join guests g on g.id=a.guest_id
  join phase_two_profiles p on p.guest_id=a.guest_id
  where a.status='approved'
    and t.mission_code='P1-TRICKSTER-001'
    and g.role='spy'
    and p.primary_mission='TRICKSTER'
    and p.unlocked_at is not null
  union
  select distinct a.guest_id
  from assignments a join tasks t on t.id=a.task_id join guests g on g.id=a.guest_id
  where a.status='approved' and t.mission_code='P2-TRICKSTER-001' and g.role='spy'
  union
  select guest_id from phase_two_profiles
  where primary_mission='EXTRA_VOTE' and unlocked_at is not null
)
update votes set vote_weight=2
where voter_guest_id in (select guest_id from eligible_voters) and vote_weight<>2;

revoke all on function cast_team_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function cast_team_vote(uuid,uuid) to service_role;
revoke all on function sync_completed_trickster_vote_weight() from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608030004','trickster_signal_vote_power_aligned','votes','all_rounds',
  jsonb_build_object('unlock_mission','P1-TRICKSTER-001','requires_phase_two',true,'vote_weight',2,'existing_ballots_backfilled',true));

commit;
