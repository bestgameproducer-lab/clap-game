-- Private guest selfies used only inside the authenticated player directory.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('guest-avatars','guest-avatars',false,1048576,array['image/jpeg']::text[])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

alter table guests add column if not exists avatar_path text;
alter table guests add column if not exists avatar_uploaded_at timestamptz;

do $$ begin
  alter table guests add constraint guests_avatar_path_check check (
    avatar_path is null or (
      length(avatar_path)<=80
      and avatar_path ~ '^[0-9a-f-]{36}/avatar[.]jpg$'
    )
  );
exception when duplicate_object then null;
end $$;

create or replace function confirm_guest_avatar(
  p_guest_id uuid,
  p_avatar_path text
) returns timestamptz
language plpgsql
security definer
set search_path=public
as $$
declare
  v_expected_path text:=p_guest_id::text||'/avatar.jpg';
  v_uploaded_at timestamptz;
begin
  perform 1 from guests where id=p_guest_id and active and uses_app for update;
  if not found then raise exception using errcode='P0002',message='avatar_guest_not_found'; end if;
  if p_avatar_path<>v_expected_path then
    raise exception using errcode='22023',message='invalid_avatar_path';
  end if;
  select updated_at into v_uploaded_at from storage.objects
  where bucket_id='guest-avatars' and name=v_expected_path;
  if not found then raise exception using errcode='P0002',message='avatar_object_missing'; end if;
  update guests set avatar_path=v_expected_path,avatar_uploaded_at=v_uploaded_at where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'guest.avatar_confirm','guest',p_guest_id::text,jsonb_build_object('uploaded_at',v_uploaded_at));
  return v_uploaded_at;
end;
$$;

revoke all on function confirm_guest_avatar(uuid,text) from public,anon,authenticated;
grant execute on function confirm_guest_avatar(uuid,text) to service_role;
