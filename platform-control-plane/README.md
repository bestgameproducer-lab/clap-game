# Platform control plane

This directory belongs to the commercial wedding-platform control plane. It must be linked to a **separate Supabase project** from the live wedding runtime.

Do not run these migrations against the existing wedding database. The wedding runtime stores guests, hidden roles, evidence, scores, and voting state; the control plane stores customer-owned project drafts, immutable versions, entitlements, and audit records.

## Required environment variables

```env
PLATFORM_SUPABASE_URL=https://YOUR_PLATFORM_PROJECT.supabase.co
PLATFORM_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PLATFORM_KEY
```

The publishable key is used only with a signed-in Supabase Auth session and Row Level Security. A service-role key is not required for customer draft saving and must never be exposed to the browser.

## Before enabling cloud accounts

1. Create or select a dedicated Supabase project for the platform.
2. Apply the migrations in `migrations/` in filename order.
3. Enable email authentication and configure the application URL plus Vercel preview/production redirect URLs.
4. Configure production SMTP before inviting real customers; Supabase's trial sender is not a production email service.
5. Add the two environment variables to Vercel Preview first and verify account isolation before adding them to Production.
6. Never copy wedding runtime tables, service-role keys, guest sessions, photos, hidden roles, or scores into this project.

The migrations also persist the structured content brief (language, interaction level, guest mix, story material, boundaries, and host notes) in the same immutable project version. A customer can submit a complete draft into `content_review`; that transition is server-validated, idempotent, versioned, audited, and locks further customer overwrites.

## Bootstrap the first platform operator

Platform staff authorization is deliberately independent from customer ownership and from the existing wedding organizer login. First sign in once through `/platform/account`, then run the following only in the **separate platform project** SQL editor, replacing the email with the intended operator account:

```sql
insert into public.platform_staff (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do update
set role = excluded.role, active = true, updated_at = now();
```

The account can then open `/platform/operations`. Operators can approve a submitted content version into `provisioning` or return it to `draft` with a required customer-visible note. Both decisions create immutable versions and audit records. Removing an operator account does not erase historical review or audit records. Do not add staff-management writes to the public browser client, and do not use a service-role key in the application.

The migrations intentionally do not integrate a payment provider or create cloud resources. Entitlements start as `pending`; a later verified payment webhook or explicit operator grant will activate them.
