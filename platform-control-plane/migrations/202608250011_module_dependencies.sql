begin;

create or replace function public.platform_modules_are_valid(p_modules text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_modules is not null
    and not ('team-games' = any(p_modules) and not ('host-toolkit' = any(p_modules)))
    and not ('live-scoreboard' = any(p_modules) and not ('team-games' = any(p_modules)))
    and not ('live-scoreboard' = any(p_modules) and not ('host-toolkit' = any(p_modules)))
    and not ('finale-vote' = any(p_modules) and not ('secret-missions' = any(p_modules)))
$$;

revoke all on function public.platform_modules_are_valid(text[]) from public, anon, authenticated;

update public.platform_projects
set modules = array_append(modules, 'team-games')
where 'live-scoreboard' = any(modules) and not ('team-games' = any(modules));

update public.platform_projects
set modules = array_append(modules, 'host-toolkit')
where ('team-games' = any(modules) or 'live-scoreboard' = any(modules))
  and not ('host-toolkit' = any(modules));

update public.platform_projects
set modules = array_append(modules, 'secret-missions')
where 'finale-vote' = any(modules) and not ('secret-missions' = any(modules));

alter table public.platform_projects
  add constraint platform_projects_module_dependencies_check
  check (public.platform_modules_are_valid(modules));

create or replace function public.platform_enforce_module_dependencies()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.platform_modules_are_valid(new.modules) then
    raise exception 'platform_project_invalid';
  end if;
  return new;
end;
$$;

revoke all on function public.platform_enforce_module_dependencies() from public, anon, authenticated;

create trigger platform_projects_enforce_module_dependencies
before insert or update of modules on public.platform_projects
for each row execute function public.platform_enforce_module_dependencies();

commit;
