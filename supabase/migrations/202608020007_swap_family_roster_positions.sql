-- Exchange the display positions of Gang Yao and Xiaofeng Jin inside the family
-- roster without changing either guest's identity, team, assignments, or scores.

create or replace function registration_guest_list(p_invitation_code text)
returns table(id uuid,name text,team text,claimed boolean)
language plpgsql security definer set search_path=public,extensions
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where game_state.id=1;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;

  return query
  select g.id,g.name,g.team,g.claim_code_hash is not null
  from guests g
  where g.active and g.uses_app and (v_state.registration_open or g.claim_code_hash is not null)
  order by
    case
      when g.participation_mode='PRINCIPAL' and g.relationship='新郎' then 0
      when g.participation_mode='PRINCIPAL' and g.relationship='新娘' then 1
      when g.participation_mode='PRINCIPAL' then 2
      when g.team='家人组' then 3
      when g.team='海岛组' then 4
      when g.team='沙漠组' then 5
      else 6
    end,
    case
      when g.team='家人组' and g.name like '姚刚%' then regexp_replace(g.name,'^姚刚','金晓峰')
      when g.team='家人组' and g.name like '金晓峰%' then regexp_replace(g.name,'^金晓峰','姚刚')
      else g.name
    end,
    g.id;
end;
$$;

revoke all on function registration_guest_list(text) from public,anon,authenticated;
grant execute on function registration_guest_list(text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608020007',
  'guest.family_registration_order_adjusted',
  'game_state',
  '1',
  jsonb_build_object('positions_exchanged',jsonb_build_array('姚刚','金晓峰'),'guest_records_changed',false)
);
