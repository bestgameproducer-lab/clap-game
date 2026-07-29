-- Audited pre-event guest roster management without deleting game history.
alter table guests add column if not exists table_label text not null default '';
alter table guests add column if not exists is_elder boolean not null default false;
alter table guests add column if not exists ceremony_eligible boolean not null default false;
alter table guests add column if not exists active boolean not null default true;
alter table guests add column if not exists staff_notes text not null default '';

do $$ begin
  alter table guests add constraint guests_roster_text_lengths_check check (
    length(trim(name)) between 1 and 120 and
    length(trim(login_name)) between 1 and 80 and
    length(table_label) <= 40 and length(staff_notes) <= 300
  );
exception when duplicate_object then null;
end $$;

create index if not exists guests_active_name_idx on guests (active,name);

create or replace function save_guest_roster(
  p_guest_id uuid,
  p_name text,
  p_login_name text,
  p_table_label text,
  p_is_elder boolean,
  p_ceremony_eligible boolean,
  p_active boolean,
  p_staff_notes text,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_id uuid;
begin
  if nullif(trim(p_name),'') is null or length(trim(p_name))>120 then
    raise exception using errcode='22023',message='invalid_guest_name';
  end if;
  if nullif(trim(p_login_name),'') is null or length(trim(p_login_name))>80 then
    raise exception using errcode='22023',message='invalid_guest_login';
  end if;
  if length(trim(coalesce(p_table_label,'')))>40 or length(trim(coalesce(p_staff_notes,'')))>300 then
    raise exception using errcode='22023',message='invalid_guest_metadata';
  end if;

  if p_guest_id is null then
    begin
      insert into guests(name,login_name,login_code,table_label,is_elder,ceremony_eligible,active,staff_notes)
      values(trim(p_name),trim(p_login_name),null,trim(coalesce(p_table_label,'')),p_is_elder,
        p_ceremony_eligible,p_active,trim(coalesce(p_staff_notes,''))) returning id into v_id;
    exception when unique_violation then
      raise exception using errcode='23505',message='guest_login_conflict';
    end;
  else
    select * into v_guest from guests where id=p_guest_id for update;
    if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
    if v_guest.claimed_at is not null and
      lower(regexp_replace(trim(v_guest.login_name),'\s+',' ','g'))<>
      lower(regexp_replace(trim(p_login_name),'\s+',' ','g')) then
      raise exception using errcode='P0001',message='guest_login_locked';
    end if;
    if v_guest.drawn_at is not null and not p_active then
      raise exception using errcode='P0001',message='drawn_guest_cannot_deactivate';
    end if;
    begin
      update guests set name=trim(p_name),login_name=trim(p_login_name),
        table_label=trim(coalesce(p_table_label,'')),is_elder=p_is_elder,
        ceremony_eligible=p_ceremony_eligible,active=p_active,
        staff_notes=trim(coalesce(p_staff_notes,''))
      where id=p_guest_id returning id into v_id;
    exception when unique_violation then
      raise exception using errcode='23505',message='guest_login_conflict';
    end;
    if v_guest.active and not p_active then
      update guest_sessions set revoked_at=now() where guest_id=p_guest_id and revoked_at is null;
    end if;
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.roster_save','guest',v_id::text,
    jsonb_build_object('name',trim(p_name),'login_name',trim(p_login_name),
      'table_label',trim(coalesce(p_table_label,'')),'is_elder',p_is_elder,
      'ceremony_eligible',p_ceremony_eligible,'active',p_active,
      'has_staff_notes',nullif(trim(coalesce(p_staff_notes,'')),'') is not null));
  return v_id;
end;
$$;

create or replace function registration_guest_list(p_invitation_code text)
returns table (id uuid,name text,team text,claimed boolean)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_state game_state%rowtype;
begin
  select * into v_state from game_state where game_state.id=1;
  if not v_state.registration_open then raise exception using errcode='P0001',message='registration_closed'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;
  return query select g.id,g.name,g.team,g.claimed_at is not null from guests g where g.active order by g.name;
end;
$$;

create or replace function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (guest_id uuid,guest_name text,account_created boolean)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_normalized_login text;
  v_account_created boolean:=false;
begin
  select * into v_state from game_state where game_state.id=1 for update;
  if not v_state.registration_open then raise exception using errcode='P0001',message='registration_closed'; end if;
  if v_state.invitation_code_hash is null or crypt(p_invitation_code,v_state.invitation_code_hash)<>v_state.invitation_code_hash then
    raise exception using errcode='28000',message='invalid_invitation_code';
  end if;
  if p_claim_code !~ '^[0-9]{4}$' then raise exception using errcode='22023',message='invalid_claim_code'; end if;

  v_normalized_login:=lower(regexp_replace(trim(p_login_name),'\s+',' ','g'));
  select * into v_guest from guests
  where active and lower(regexp_replace(trim(login_name),'\s+',' ','g'))=v_normalized_login for update;
  if not found then raise exception using errcode='P0002',message='invalid_login_name'; end if;

  if v_guest.claim_code_hash is null then
    update guests set claim_code_hash=crypt(p_claim_code,gen_salt('bf')),claimed_at=now() where id=v_guest.id;
    v_account_created:=true;
  else
    if crypt(p_claim_code,v_guest.claim_code_hash)<>v_guest.claim_code_hash then
      raise exception using errcode='28000',message='invalid_claim_code';
    end if;
    update guests set claimed_at=coalesce(claimed_at,now()) where id=v_guest.id;
  end if;
  insert into guest_sessions(guest_id,token_hash,expires_at) values(v_guest.id,p_token_hash,p_expires_at);
  return query select v_guest.id,v_guest.name,v_account_created;
end;
$$;

revoke all on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text) from public,anon,authenticated;
revoke all on function registration_guest_list(text) from public,anon,authenticated;
revoke all on function claim_guest_by_login(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function save_guest_roster(uuid,text,text,text,boolean,boolean,boolean,text,text) to service_role;
grant execute on function registration_guest_list(text) to service_role;
grant execute on function claim_guest_by_login(text,text,text,text,timestamptz) to service_role;
