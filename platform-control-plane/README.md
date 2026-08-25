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

The delivery scope (commercial model, customization depth, operating support, rehearsal mode, service items, and customer notes) is validated as a closed JSON shape and stored in the same immutable version. It records quote intent only: it does not contain a price, create an order, activate an entitlement, or provision resources.

The guest-data lifecycle policy is a separate closed JSON shape. It permits only 7, 30, or 90 days after the wedding, requires an isolated runtime, and records the project owner's roster-authority and guest-notice confirmations. A project cannot enter review or provisioning without both confirmations. This policy contains no guest records and does not itself upload a roster; old project versions are not rewritten by the forward migration.

Selected runtime modules are also dependency-checked in the application and database. The forward migration repairs any older preview rows before adding the constraint, and a database trigger returns the stable `platform_project_invalid` error if a caller bypasses the browser validator.

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

After an operator approves a submitted version, `/platform/operations` can lock one immutable `wedding-instance-config/v2` manifest for that exact project version. Locking is staff-only, idempotent, protected by an advisory lock, SHA-256 signed, and audited. It does **not** create a Vercel project, Supabase project, domain, database, or paid resource. Previously locked v1 manifests remain immutable and readable.

The manifest contains only the non-sensitive settings needed to prepare an isolated runtime: template/version identifiers, couple display names, wedding date and location, capacity, theme, tone, selected modules, interaction settings, language, delivery plan and the finite data-lifecycle policy. It deliberately excludes story text, avoidance boundaries, host notes, guest records, photos, scores, hidden roles and all credentials. Operators should compare the displayed hash with the downloaded JSON before any later provisioning workflow consumes it.

Once the manifest is locked and the entitlement is explicitly `active`, an operator can register an already-created isolated runtime target. The registry stores only the exact manifest version/hash, a public HTTPS origin and a non-secret deployment reference. It rejects credentials, URL paths, query strings and fragments; it never stores provider tokens or database connection strings. Registration does not create resources and does not make a server-side request to the target.

A registered runtime advances through two manual, ordered launch gates. `verification` confirms the public origin, exact manifest hash, isolated data boundary, staff access and absence of secrets. `readiness` records a multi-device rehearsal across guest and operator roles, stage transitions and fallback materials. Both operations are staff-only, closed-shape, idempotent and audited; current manifest/entitlement prerequisites are rechecked inside the database transaction. Obvious database URLs, provider keys and JWT-like values are rejected from operator notes. Completing both gates changes the project to `ready`, meaning “ready for a separate release decision”; it does not probe the target, publish a deployment, change DNS or start an event.

The separate release decision rechecks the ready instance, exact current manifest, both attestations and active entitlement. Operators must confirm owner approval, the public entry and QR code, wedding-day support, the external rollback procedure and the data-deletion deadline before recording `live`. This transaction stores an immutable non-secret snapshot and audit event but never calls a deployment provider. A live project can be put on hold only after the operator confirms that external access was already restricted; the project returns to `ready` while all release history remains intact. The hold path intentionally remains available if commercial entitlement state later changes, so a safety action cannot be blocked by billing state.

Migration `202608250017` separates customer communication from the internal release event. The v2 release RPC atomically stores a purpose-written customer message in `platform_customer_delivery_events`; project members can read only the action, project version, message and timestamp. Target origins, deployment references, manifest hashes, internal notes, actors and checklists stay in the staff-only table. Customer messages reject URLs, 64-character hashes, common deployment-reference shapes and obvious secrets. The authenticated grant on the old v1 RPC is revoked so new release actions cannot omit the customer summary.

Customer drafts also include a structured template content pack: two team names, one host opening script, up to twenty couple-quiz questions, thirty quick-quiz question/answer pairs, eighty charades words and up to ten allowlisted mission-copy overrides. Mission overrides contain only a mission code plus guest-visible title and description. Points, assignment count, stage, role scope, verification, scoring and every mechanism task remain locked to the flagship contract. The opening script accepts only the documented `{{partnerOne}}`, `{{partnerTwo}}`, `{{couple}}`, `{{location}}` and `{{weddingDate}}` variables. Server and database validation reject HTML brackets, unknown variables, unexpected JSON fields and oversized content. The pack is included in every new immutable version and in the signed provisioning manifest as plain configuration; private story material and avoidance notes remain excluded. The customer/operations control plane can review quiz answers and mission copy, but no platform content-bank field is sent to the existing guest application. A future isolated-instance generator may apply the mission copy only as a presentation overlay and must never mutate the server-authoritative official task contract.
