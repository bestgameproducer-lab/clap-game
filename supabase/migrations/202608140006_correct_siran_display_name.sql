-- Correct the confirmed Chinese display name without changing the login name,
-- credentials, assignments, points, or any other wedding runtime state.

begin;

with corrected as (
  update guests
  set name='李思冉 Siran Li'
  where lower(regexp_replace(trim(login_name),'\s+',' ','g'))='siran li'
    and name is distinct from '李思冉 Siran Li'
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608140006','guest.display_name_corrected','guest',id::text,
  jsonb_build_object('login_name_unchanged',true,'display_name','李思冉 Siran Li')
from corrected;

commit;
