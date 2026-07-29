-- Staff redemption workflow and final award configuration.
create or replace function complete_assignment_at_station(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default '任务站现场核验通过'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from assignments where id=p_assignment_id for update;
  if not found then raise exception using errcode='P0002', message='assignment_not_found'; end if;
  if v_status='approved' then raise exception using errcode='P0001', message='assignment_already_approved'; end if;
  if v_status in ('assigned','rejected') then
    update assignments set status='submitted',submitted_at=now(),rejected_at=null,rejection_reason=null where id=p_assignment_id;
  elsif v_status<>'submitted' then
    raise exception using errcode='P0001', message='assignment_not_completable';
  end if;
  return approve_assignment(p_assignment_id,p_actor,p_reason);
end;
$$;

revoke all on function complete_assignment_at_station(uuid,text,text) from public, anon, authenticated;
grant execute on function complete_assignment_at_station(uuid,text,text) to service_role;

create table if not exists awards (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  winner_guest_id uuid references guests(id) on delete set null,
  winner_team text check (winner_team is null or winner_team in ('玫瑰组','月桂组','星辰组','琥珀组')),
  reason text not null default '' check (length(reason) <= 500),
  sort_order integer not null default 100 check (sort_order between 0 and 9999),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (winner_guest_id is null or winner_team is null),
  check (not published or winner_guest_id is not null or winner_team is not null)
);

alter table awards enable row level security;
revoke all on awards from public, anon, authenticated;
create index if not exists awards_published_order_idx on awards (published, sort_order, created_at);

insert into awards (title,sort_order)
select seed.title,seed.sort_order from (values
  ('团队冠军',100),('任务达人奖',200),('最强侦探奖',210),('最佳队友奖',220),('最佳照片奖',230),
  ('最快任务完成奖',240),('丘比特幸运奖',250),('孤独丘比特奖',260),('最佳恶作剧者奖',270)
) as seed(title,sort_order)
where not exists (select 1 from awards a where a.title=seed.title);

create or replace function save_award(
  p_award_id uuid,
  p_title text,
  p_winner_guest_id uuid,
  p_winner_team text,
  p_reason text,
  p_sort_order integer,
  p_published boolean,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if nullif(trim(p_title),'') is null or length(trim(p_title))>120 then raise exception using errcode='22023',message='invalid_award_title'; end if;
  if p_winner_guest_id is not null and p_winner_team is not null then raise exception using errcode='22023',message='award_winner_conflict'; end if;
  if p_winner_guest_id is not null and not exists(select 1 from guests where id=p_winner_guest_id) then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if p_winner_team is not null and p_winner_team not in ('玫瑰组','月桂组','星辰组','琥珀组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_published and p_winner_guest_id is null and p_winner_team is null then raise exception using errcode='22023',message='award_winner_required'; end if;
  if length(coalesce(p_reason,''))>500 or p_sort_order<0 or p_sort_order>9999 then raise exception using errcode='22023',message='invalid_award_details'; end if;

  if p_award_id is null then
    insert into awards(title,winner_guest_id,winner_team,reason,sort_order,published)
    values(trim(p_title),p_winner_guest_id,p_winner_team,trim(coalesce(p_reason,'')),p_sort_order,p_published)
    returning id into v_id;
  else
    update awards set title=trim(p_title),winner_guest_id=p_winner_guest_id,winner_team=p_winner_team,
      reason=trim(coalesce(p_reason,'')),sort_order=p_sort_order,published=p_published,updated_at=now()
    where id=p_award_id returning id into v_id;
    if v_id is null then raise exception using errcode='P0002',message='award_not_found'; end if;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'award.save','award',v_id::text,jsonb_build_object('title',trim(p_title),'winner_guest_id',p_winner_guest_id,'winner_team',p_winner_team,'published',p_published));
  return v_id;
end;
$$;

revoke all on function save_award(uuid,text,uuid,text,text,integer,boolean,text) from public, anon, authenticated;
grant execute on function save_award(uuid,text,uuid,text,text,integer,boolean,text) to service_role;
