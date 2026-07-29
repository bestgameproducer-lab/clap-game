import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('task station data excludes hidden roles and credentials', async () => {
  const source = await readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8');
  for (const forbidden of ['password_hash', 'claim_code', 'role,', 'correct_answer', 'host_notes']) {
    assert.equal(source.includes(forbidden), false, `station source must not include ${forbidden}`);
  }
  const route = await readFile(new URL('../app/api/station-data/route.ts', import.meta.url), 'utf8');
  assert.match(route, /await requireAdmin\(\)/);
});

test('published awards are loaded only inside the results boundary', async () => {
  const source = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
  const resultsGuard = source.indexOf('if (game.results_visible)');
  const awardsQuery = source.indexOf("from('awards')");
  assert.ok(resultsGuard >= 0 && awardsQuery > resultsGuard);
  assert.match(source.slice(awardsQuery, awardsQuery + 180), /eq\('published', true\)/);
});

test('station completion and award publishing remain server-authoritative', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607280012_station_and_awards.sql', import.meta.url), 'utf8');
  assert.match(migration, /return approve_assignment\(p_assignment_id,p_actor,p_reason\)/);
  assert.match(migration, /not published or winner_guest_id is not null or winner_team is not null/);
  assert.match(migration, /revoke all on awards from public, anon, authenticated/);
});

test('award export is explicit and excludes private guest fields', async () => {
  const source = await readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8');
  const awardExport = source.slice(source.indexOf("kind === 'awards'"), source.indexOf("} else {", source.indexOf("kind === 'awards'")));
  assert.match(awardExport, /title,winner_team,reason,sort_order,published,updated_at,winner:guests\(name\)/);
  for (const forbidden of ['role', 'claim_code', 'password_hash', 'session']) assert.equal(awardExport.includes(forbidden), false);
});
