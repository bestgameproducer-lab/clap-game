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

Project owners can create seven-day, single-use collaboration links for an editor or viewer. The raw invitation token exists only in the generated URL; the database stores its SHA-256 hash. Recipients must authenticate with their own platform account before accepting. Editors can save draft versions but cannot submit content review, invite members, or manage delivery. Viewers are read-only. Owners can revoke an unclaimed link or remove a member at any time, and every change is idempotent and audited.

The migrations intentionally do not integrate a payment provider or create cloud resources. Entitlements start as `pending`; a later verified payment webhook or explicit operator grant will activate them.

## Approved-version provisioning manifest

After an operator approves a submitted version, `/platform/operations` can lock one immutable `wedding-instance-config/v1` manifest for that exact project version. Locking is staff-only, idempotent, protected by an advisory lock, SHA-256 signed, and audited. It does **not** create a Vercel project, Supabase project, domain, database, or paid resource.

The manifest contains only the non-sensitive settings needed to prepare an isolated runtime: template/version identifiers, couple display names, wedding date and location, capacity, theme, tone, selected modules, interaction settings, language and delivery plan. It deliberately excludes story text, avoidance boundaries, host notes, guest records, photos, scores, hidden roles and all credentials. Operators should compare the displayed hash with the downloaded JSON before any later provisioning workflow consumes it.

Once the manifest is locked and the entitlement is explicitly `active`, an operator can register an already-created isolated runtime target. The registry stores only the exact manifest version/hash, a public HTTPS origin and a non-secret deployment reference. It rejects credentials, URL paths, query strings and fragments; it never stores provider tokens or database connection strings. Registration does not create resources and does not make a server-side request to the target. A later milestone must add an allowlisted health-check contract before a registered target can advance to `verified` or `ready`.

Customer drafts also include a structured template content pack: two team names, one host opening script, up to twenty couple-quiz questions, thirty quick-quiz question/answer pairs and eighty charades words. The opening script accepts only the documented `{{partnerOne}}`, `{{partnerTwo}}`, `{{couple}}`, `{{location}}` and `{{weddingDate}}` variables. Server and database validation reject HTML brackets, unknown variables, unexpected JSON fields and oversized content. The pack is included in every new immutable version and in the signed provisioning manifest as plain configuration; private story material and avoidance notes remain excluded. The customer/operations control plane can review quiz answers, but no platform content-bank field is sent to the existing guest application.
