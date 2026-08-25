begin;

alter function public.platform_template_content_is_valid(jsonb)
  rename to platform_template_content_v3_is_valid;

revoke all on function public.platform_template_content_v3_is_valid(jsonb) from public, anon, authenticated;

create or replace function public.platform_template_content_is_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.platform_template_content_v3_is_valid(p_value)
    and lower(btrim(p_value ->> 'teamOneName')) <> lower(btrim(p_value ->> 'teamTwoName'));
$$;

revoke all on function public.platform_template_content_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  drop constraint platform_projects_template_content_check;

-- Existing customer copy is never renamed silently. The new validator and this
-- NOT VALID constraint reject every future invalid write while allowing an
-- operator to review a pre-existing duplicate before validating the constraint.
alter table public.platform_projects
  add constraint platform_projects_template_content_check
  check (public.platform_template_content_is_valid(template_content)) not valid;

commit;
