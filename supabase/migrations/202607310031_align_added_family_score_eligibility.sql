-- Keep the two later-added honor-family guests consistent with the original
-- honor-family roster: family card, no secret missions, but personal scoring.
begin;

do $$
declare
  v_family_count integer;
begin
  select count(*) into v_family_count
  from guests
  where active
    and team='家人组'
    and participation_mode='HONOR_GUEST'
    and lower(login_name) in ('huimin xu','gang yao');

  if v_family_count<>2 then
    raise exception using errcode='P0001',message='added_honor_family_roster_mismatch';
  end if;
end;
$$;

update guests
set eligible_for_personal_score=true
where active
  and team='家人组'
  and participation_mode='HONOR_GUEST'
  and lower(login_name) in ('huimin xu','gang yao');

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202607310031',
  'guest.honor_family_score_eligibility_aligned',
  'guest_group',
  'HONOR_GUEST',
  jsonb_build_object('guest_count',2,'personal_points',true,'secret_missions',false)
);

commit;
