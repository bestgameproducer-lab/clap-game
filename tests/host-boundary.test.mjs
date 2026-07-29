import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public scoreboard source never queries private host answers', async () => {
  const source = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('correct_answer'), false);
  assert.equal(source.includes('host_notes'), false);
  assert.equal(source.includes("from('host_segments')"), false);
});

test('host data endpoint requires administrator authorization', async () => {
  const source = await readFile(new URL('../app/api/host-data/route.ts', import.meta.url), 'utf8');
  assert.match(source, /await requireAdmin\(\)/);
  assert.match(source, /getHostDashboardData/);
});

test('database publish function copies only public segment fields', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607280011_host_segment_library.sql', import.meta.url), 'utf8');
  const publishBody = migration.slice(migration.indexOf('create or replace function publish_host_segment'));
  assert.match(publishBody, /display_title=v_segment\.title/);
  assert.match(publishBody, /display_body=v_segment\.public_prompt/);
  assert.equal(/display_[a-z_]*=v_segment\.correct_answer/.test(publishBody), false);
  assert.equal(/display_[a-z_]*=v_segment\.host_notes/.test(publishBody), false);
});
