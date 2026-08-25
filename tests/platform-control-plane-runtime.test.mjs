import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

let PGlite = null;
let pgcrypto = null;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  // The structural test remains mandatory when the optional runtime is unavailable.
}

const bootstrap = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`;

const saveSql = `
select * from public.platform_save_project_draft(
  $1::uuid,
  null::uuid,
  $2::uuid,
  'cupid-wedding-trial',
  '2026.08',
  'buyout',
  'Zimin',
  'Anrong',
  '2026-08-16'::date,
  'Bali',
  80,
  'estate',
  'romantic',
  array['secret-missions','host-toolkit']::text[],
  'runtime test'
)
`;

test(
  'platform SQL runtime keeps saves owner-scoped, versioned, audited and idempotent',
  { skip: PGlite && pgcrypto ? false : 'requires optional @electric-sql/pglite' },
  async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    const ownerOne = '10000000-0000-4000-8000-000000000001';
    const ownerTwo = '10000000-0000-4000-8000-000000000002';
    const draftId = '20000000-0000-4000-8000-000000000001';
    const eventOne = '30000000-0000-4000-8000-000000000001';
    const eventTwo = '30000000-0000-4000-8000-000000000002';

    try {
      await db.exec(bootstrap);
      await db.exec(await readFile(new URL('../platform-control-plane/migrations/202608250001_platform_foundation.sql', import.meta.url), 'utf8'));
      await db.query('insert into auth.users(id) values ($1), ($2)', [ownerOne, ownerTwo]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');

      const first = await db.query(saveSql, [eventOne, draftId]);
      assert.equal(first.rows[0].current_version, 1);
      const projectId = first.rows[0].id;

      const retry = await db.query(saveSql, [eventOne, draftId]);
      assert.equal(retry.rows[0].id, projectId);
      assert.equal(retry.rows[0].current_version, 1);

      const second = await db.query(saveSql, [eventTwo, draftId]);
      assert.equal(second.rows[0].id, projectId);
      assert.equal(second.rows[0].current_version, 2);

      await db.exec('reset role');
      const counts = await db.query(`
        select
          (select count(*)::int from platform_projects) projects,
          (select count(*)::int from platform_project_versions) versions,
          (select count(*)::int from platform_entitlements) entitlements,
          (select count(*)::int from platform_audit_log) audits,
          (select count(*)::int from platform_mutation_receipts) receipts
      `);
      assert.deepEqual(counts.rows[0], { projects: 1, versions: 2, entitlements: 1, audits: 2, receipts: 2 });

      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.exec('set role authenticated');
      const isolated = await db.query('select count(*)::int count from platform_projects');
      assert.equal(isolated.rows[0].count, 0);
    } finally {
      try { await db.exec('reset role'); } catch {}
      await db.close();
    }
  },
);
