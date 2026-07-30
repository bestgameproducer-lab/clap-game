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

test('host score data returns eligible guests without roles or credentials', async () => {
  const source = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
  const scoreDto = source.slice(source.indexOf('export async function getHostDashboardData'), source.indexOf('export async function adjustHostTeamPoints'));
  assert.match(scoreDto, /select\('id,name,team,points,participation_mode,special_card_title'\)/);
  assert.match(scoreDto, /eq\('eligible_for_personal_score', true\)/);
  assert.doesNotMatch(scoreDto, /voter_guest_id|pin_hash|role,|hidden_role|claim_code_hash/);
});

test('host page does not expose voting or private run-of-show content', async () => {
  const source = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /voteCounts|揭晓票数|correct_answer|host_notes|流程题库/);
  assert.match(source, /现场只开放团队加分与个人加分/);
});

test('database publish function copies only public segment fields', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607280011_host_segment_library.sql', import.meta.url), 'utf8');
  const publishBody = migration.slice(migration.indexOf('create or replace function publish_host_segment'));
  assert.match(publishBody, /display_title=v_segment\.title/);
  assert.match(publishBody, /display_body=v_segment\.public_prompt/);
  assert.equal(/display_[a-z_]*=v_segment\.correct_answer/.test(publishBody), false);
  assert.equal(/display_[a-z_]*=v_segment\.host_notes/.test(publishBody), false);
});
