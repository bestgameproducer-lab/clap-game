-- Give heart partners the same private, server-authoritative left/right fragment
-- experience as star partners. Existing pending and active pairs are preserved.

begin;

alter table symbol_pairing_assignments
  drop constraint if exists symbol_pairing_fragment_side_check;
alter table symbol_pairing_assignments
  add constraint symbol_pairing_fragment_side_check
  check (symbol in ('HEART','STAR') and fragment_side in ('LEFT','RIGHT')) not valid;

create or replace function assign_star_fragment_side()
returns trigger language plpgsql set search_path=public as $$
declare v_left integer; v_right integer;
begin
  if new.fragment_side is null then
    perform pg_advisory_xact_lock(hashtext('wedding-symbol-fragment-side-v2:'||new.symbol));
    select count(*) filter(where fragment_side='LEFT'),count(*) filter(where fragment_side='RIGHT')
      into v_left,v_right from symbol_pairing_assignments
      where symbol=new.symbol and guest_id<>new.guest_id;
    new.fragment_side:=case when v_left<=v_right then 'LEFT' else 'RIGHT' end;
  end if;
  return new;
end; $$;

-- Keep both members of every existing live heart pair complementary, then
-- balance any remaining unpaired heart holders without changing ownership.
update symbol_pairing_assignments s set fragment_side=case
  when s.guest_id=r.player_a_id then 'LEFT' else 'RIGHT' end
from player_relationships r
where r.relationship_type='CUPID_ALLIANCE' and r.status in ('PENDING','ACTIVE')
  and s.symbol='HEART' and s.guest_id in(r.player_a_id,r.player_b_id);

update symbol_pairing_assignments
set fragment_side=null
where symbol='HEART' and fragment_side is null;

alter table symbol_pairing_assignments
  validate constraint symbol_pairing_fragment_side_check;

create or replace function request_player_connection(p_guest_id uuid,p_target_code text,p_relationship_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_stage text; v_max_attempts integer; v_guest guests%rowtype; v_target guests%rowtype;
  v_a uuid; v_b uuid; v_is_a boolean; v_relation player_relationships%rowtype;
  v_symbol text; v_expected_role text; v_attempts integer; v_mechanic text; v_unlocked text;
  v_guest_fragment text; v_target_fragment text;
begin
  select stage,trickster_max_attempts into v_stage,v_max_attempts from game_state where id=1 for share;
  select * into v_guest from guests where id=p_guest_id and active and drawn_at is not null for update;
  if not found then raise exception using errcode='P0002',message='connection_guest_not_ready'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code)) for update;
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=v_guest.id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if v_guest.id::text<v_target.id::text then v_a:=v_guest.id;v_b:=v_target.id;v_is_a:=true;
  else v_a:=v_target.id;v_b:=v_guest.id;v_is_a:=false; end if;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='symbol_connection_stage_closed'; end if;
    v_symbol:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART' else 'STAR' end;
    v_expected_role:=case when v_symbol='HEART' then 'HEART_HOLDER' else 'STAR_HOLDER' end;
    if v_guest.story_role<>v_expected_role or v_target.story_role<>v_expected_role then
      raise exception using errcode='P0001',message='symbol_holder_required';
    end if;
    select fragment_side into v_guest_fragment from symbol_pairing_assignments where guest_id=v_guest.id and symbol=v_symbol;
    select fragment_side into v_target_fragment from symbol_pairing_assignments where guest_id=v_target.id and symbol=v_symbol;
    if v_guest_fragment is null or v_target_fragment is null or v_guest_fragment=v_target_fragment then
      raise exception using errcode='P0001',message=case when v_symbol='HEART' then 'heart_fragment_side_mismatch' else 'star_fragment_side_mismatch' end;
    end if;
    if exists(select 1 from symbol_pairing_assignments where guest_id in(v_guest.id,v_target.id) and status in('PAIRED','UNPAIRED_FINAL')) then
      raise exception using errcode='P0001',message='symbol_player_unavailable';
    end if;
    if exists(select 1 from player_relationships r where r.relationship_type=p_relationship_type and r.status='PENDING'
      and (r.player_a_id in(v_guest.id,v_target.id) or r.player_b_id in(v_guest.id,v_target.id))
      and not(r.player_a_id=v_a and r.player_b_id=v_b)) then
      raise exception using errcode='P0001',message='symbol_pending_conflict';
    end if;
  elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;
    if v_guest.role<>'spy' then raise exception using errcode='28000',message='trickster_connection_forbidden'; end if;
    if not exists(select 1 from trickster_signal_attempts where guest_id=v_guest.id and target_guest_id=v_target.id) then
      select count(*)::integer into v_attempts from trickster_signal_attempts where guest_id=v_guest.id;
      if v_attempts>=v_max_attempts then raise exception using errcode='P0001',message='trickster_attempt_limit'; end if;
      insert into trickster_signal_attempts(guest_id,target_guest_id,matched) values(v_guest.id,v_target.id,v_target.role='spy');
      insert into audit_log(actor,action,target_type,target_id,details)
      values('guest:'||v_guest.id::text,'trickster.signal_attempt','guest',v_guest.id::text,
        jsonb_build_object('target_guest_id',v_target.id,'matched',v_target.role='spy','attempt_limit',v_max_attempts));
    end if;
    if v_target.role<>'spy' then return jsonb_build_object('relationshipType',p_relationship_type,'status','NO_MATCH','maxAttempts',v_max_attempts); end if;
  else
    raise exception using errcode='22023',message='invalid_relationship_type';
  end if;

  insert into player_relationships(relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status)
  values(p_relationship_type,v_a,v_b,v_is_a,not v_is_a,'PENDING')
  on conflict(relationship_type,player_a_id,player_b_id) do update set
    player_a_confirmed=case when player_relationships.status='REJECTED' then excluded.player_a_confirmed else player_relationships.player_a_confirmed or excluded.player_a_confirmed end,
    player_b_confirmed=case when player_relationships.status='REJECTED' then excluded.player_b_confirmed else player_relationships.player_b_confirmed or excluded.player_b_confirmed end,
    status=case when player_relationships.status='REJECTED' then 'PENDING' else player_relationships.status end,
    activated_at=case when player_relationships.status='REJECTED' then null else player_relationships.activated_at end
  returning * into v_relation;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    update symbol_pairing_assignments set status='PENDING',pending_relationship_id=v_relation.id,updated_at=now()
    where guest_id in(v_a,v_b) and status in('AVAILABLE','PENDING');
  end if;
  if v_relation.player_a_confirmed and v_relation.player_b_confirmed and v_relation.status='PENDING' then
    update player_relationships set status='ACTIVE',activated_at=now() where id=v_relation.id returning * into v_relation;
    if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
      v_mechanic:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART_MATCH' else 'STAR_MATCH' end;
      v_unlocked:=case when p_relationship_type='CUPID_ALLIANCE' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
      update symbol_pairing_assignments set status='PAIRED',partner_guest_id=case when guest_id=v_a then v_b else v_a end,
        pending_relationship_id=null,updated_at=now() where guest_id in(v_a,v_b);
      update guests set unlocked_role=v_unlocked where id in(v_a,v_b);
      perform complete_system_mission(v_a,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
      perform complete_system_mission(v_b,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
    else
      perform complete_system_mission(v_a,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
      perform complete_system_mission(v_b,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:relationship','relationship.activate','player_relationship',v_relation.id::text,
      jsonb_build_object('relationship_type',p_relationship_type,'player_a_id',v_a,'player_b_id',v_b));
  end if;
  return jsonb_build_object('relationshipType',p_relationship_type,'status',v_relation.status,'maxAttempts',v_max_attempts);
end; $$;

revoke all on function assign_star_fragment_side() from public,anon,authenticated;
revoke all on function request_player_connection(uuid,text,text) from public,anon,authenticated;
grant execute on function request_player_connection(uuid,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310022','heart.fragment_pairing_enabled','game_state','1',jsonb_build_object(
  'existing_relationships_preserved',true,'opposite_halves_required',true,'runtime_progress_preserved',true));

commit;
