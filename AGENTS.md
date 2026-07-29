# Wedding Game Engineering Rules

## Architecture
- Keep route handlers thin. Put validation in `lib/validation`, authorization in `lib/auth`, and database operations in `lib/data`.
- Server-only code may use the Supabase service-role key. Client components must never import server-only modules.
- Prefer explicit response DTOs over `select('*')`, especially for guests, roles, credentials, tasks, and clues.

## Security
- Treat guest roles, private tasks, claim codes, sessions, scores, approvals, and answers as server-authoritative.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, claim/login codes, password hashes, session hashes, or hidden roles to unauthorized clients.
- Production must fail closed when required secrets are absent or weak.
- Every mutating route requires authentication, input validation, and same-origin protection.
- Administrator mutations must be written to the audit log.

## Database migrations
- Add forward-only, timestamped migrations under `supabase/migrations`; do not rewrite an applied migration.
- Preserve existing production data. Never drop or truncate a production table without an approved recovery plan.
- Use constraints and transactional RPC functions for invariants that cannot safely be enforced in application code.

## UI
- Design mobile-first and test narrow screens and the WeChat browser.
- Provide loading, empty, error, success, and offline states for user-facing workflows.
- Never render private role or task data on public pages or the public scoreboard.

## Testing
- Add regression tests for validation, authentication, authorization, idempotency, scoring, voting, and hidden-data boundaries.
- Run `npm run typecheck`, `npm test`, and `npm run build` before handoff.

## Git workflow
- Work on a `codex/` feature branch. Do not push directly to `main`.
- Keep commits focused and never commit `.env` files, credentials, generated build output, or local stores.
- Present the plan and affected files before pushing or opening a pull request.

## Definition of done
- Acceptance criteria are implemented; migrations are forward-safe; authorization and validation are centralized.
- Tests and production build pass; errors are handled visibly; sensitive response fields have been reviewed.
- Documentation and environment examples match the implementation, and the worktree contains no accidental files.
