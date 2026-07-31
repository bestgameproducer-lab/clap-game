-- The latest team-coverage draw accidentally treated every locked role as a
-- guest. Restore preset tricksters and reserve their team's only trickster
-- slot before any other guest draws. Existing draws and assignments remain
-- untouched.

begin;

do $migration$
declare
  v_draw_definition text;
  v_configure_definition text;
  v_buggy_role_branch constant text := $q$if v_guest.team='家人组' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or v_guest.role_locked then
    v_role:='guest';
  else$q$;
  v_fixed_role_branch constant text := $q$if v_guest.team='家人组' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or (v_guest.role_locked and v_guest.role='guest') then
    v_role:='guest';
  elsif v_guest.role_locked then
    v_role:=v_guest.role;
    if v_role<>'spy' then raise exception using errcode='P0001',message='invalid_preset_role'; end if;
  else$q$;
  v_reserved_guest_query constant text := $q$select count(*) into v_reserved_guests from guests g where g.id<>v_guest.id and g.active and g.phase_two_eligible
      and g.drawn_at is null and g.team=v_guest.team
      and (g.story_role<>'NONE' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest'));$q$;
  v_reserved_queries constant text := $q$select count(*) into v_reserved_guests from guests g where g.id<>v_guest.id and g.active and g.phase_two_eligible
      and g.drawn_at is null and g.team=v_guest.team
      and (g.story_role<>'NONE' or not g.eligible_for_secret_role or (g.role_locked and g.role='guest'));
    select count(*) into v_reserved_spies from guests g where g.id<>v_guest.id and g.active and g.phase_two_eligible
      and g.drawn_at is null and g.team=v_guest.team and g.role_locked and g.role='spy';$q$;
begin
  select pg_get_functiondef('public.draw_guest_card(uuid)'::regprocedure)
  into v_draw_definition;

  if position(v_buggy_role_branch in v_draw_definition)=0
    or position('v_reserved_guests integer;' in v_draw_definition)=0
    or position(v_reserved_guest_query in v_draw_definition)=0
    or position($q$generate_series(1,greatest(0,1-v_drawn_spies))$q$ in v_draw_definition)=0 then
    raise exception using errcode='P0001',message='latest_draw_preset_patch_target_not_found';
  end if;

  v_draw_definition:=replace(
    v_draw_definition,
    'v_reserved_guests integer;',
    'v_reserved_guests integer; v_reserved_spies integer;'
  );
  v_draw_definition:=replace(v_draw_definition,v_buggy_role_branch,v_fixed_role_branch);
  v_draw_definition:=replace(v_draw_definition,v_reserved_guest_query,v_reserved_queries);
  v_draw_definition:=replace(
    v_draw_definition,
    'generate_series(1,greatest(0,1-v_drawn_spies))',
    'generate_series(1,greatest(0,1-v_drawn_spies-v_reserved_spies))'
  );
  execute v_draw_definition;

  select pg_get_functiondef('public.configure_guest_game_profile(uuid,text,text,text)'::regprocedure)
  into v_configure_definition;
  if position($q$hashtext('wedding-secret-card-draw-v2')$q$ in v_configure_definition)=0 then
    raise exception using errcode='P0001',message='preset_configuration_lock_patch_target_not_found';
  end if;
  execute replace(
    v_configure_definition,
    $q$hashtext('wedding-secret-card-draw-v2')$q$,
    $q$hashtext('wedding-secret-card-draw-v4')$q$
  );
end;
$migration$;

revoke all on function draw_guest_card(uuid) from public,anon,authenticated;
grant execute on function draw_guest_card(uuid) to service_role;
revoke all on function configure_guest_game_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function configure_guest_game_profile(uuid,text,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310021','phase_one.latest_preset_trickster_draw_fixed','game_state','1',
  jsonb_build_object(
    'existing_draws_preserved',true,
    'preset_role_respected',true,
    'preset_trickster_slot_reserved',true,
    'configuration_and_draw_lock_aligned',true
  ));

commit;
