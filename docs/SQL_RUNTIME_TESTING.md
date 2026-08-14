# SQL runtime regression

`tests/sql-runtime-integration.test.mjs` is the database-level regression for
the wedding lifecycle. Unlike the source-contract tests, it boots a real
PostgreSQL-compatible PGlite engine, applies `supabase/schema.sql` and every
migration in timestamp order, and executes the reset, official-task, clue,
rehearsal-run and finale-lock paths.

The production app does not need this runtime. A normal `npm test` reports the
case as **SKIP** when `@electric-sql/pglite` is unavailable; it must never
report a database pass in that state. Install `@electric-sql/pglite` as a
development dependency (including its lockfile change), then run:

```sh
npm run test:sql
```

With `WEDDING_REQUIRE_SQL_RUNTIME=1`, a missing runtime is a hard failure. This
keeps constrained local environments honest while allowing CI or a prepared
release machine to enforce actual SQL execution.

The release machine must record a real `npm run test:sql` pass. A skipped case
is only an explicit environment limitation, never evidence that migrations
passed. The runtime scenario applies the complete migration chain and then
executes official first-act approval, all twenty competitive card draws,
second-act allocation, ability completion, explicit team scoring and clue
settlement, family-only personal scoring, terminal score locks, and a complete
rehearsal reset including the clue library and rehearsal-run rotation.
