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

The first migration intentionally does not integrate a payment provider. Entitlements start as `pending`; a later verified payment webhook or explicit operator grant will activate them.
