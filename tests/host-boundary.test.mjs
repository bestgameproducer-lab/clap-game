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

test('authenticated host data returns private finale ballots without credentials', async () => {
  const source = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
  const scoreDto = source.slice(source.indexOf('export async function getHostDashboardData'), source.indexOf('export async function adjustHostTeamPoints'));
  assert.match(scoreDto, /select\('id,name,team,role,is_hidden_spy,points,participation_mode,phase_two_eligible,special_card_title,eligible_for_personal_score,drawn_at,special_card_revealed_at'\)/);
  assert.match(scoreDto, /voter_guest_id,target_guest_id,vote_weight/);
  assert.doesNotMatch(scoreDto, /pin_hash|hidden_role|claim_code_hash|password_hash/);
});

test('host page exposes finale ballots only in the result section and no run-of-show answers', async () => {
  const source = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /data\.finale\.voteCounts/);
  assert.doesNotMatch(source, /correct_answer|host_notes|流程题库/);
  assert.match(source, /全员总览/);
  assert.match(source, /恶作剧者/);
});

test('host finale exposes personal and team rankings after result publication', async () => {
  const [page, dataSource] = await Promise.all([
    readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(dataSource, /buildPublicScoreboard/);
  assert.match(dataSource, /rankings: \{ personal: rankings\.leaders, teams: rankings\.teams \}/);
  assert.match(page, /data\.game\?\.results_visible/);
  assert.match(page, /完整最终排名/);
  assert.match(page, /完整个人排名/);
  assert.match(page, /逃脱者置顶、被识破者置底且均不显示积分/);
  assert.match(page, /data\.rankings\.personal\.length/);
});

test('database publish function copies only public segment fields', async () => {
  const migration = await readFile(new URL('../supabase/migrations/202607280011_host_segment_library.sql', import.meta.url), 'utf8');
  const publishBody = migration.slice(migration.indexOf('create or replace function publish_host_segment'));
  assert.match(publishBody, /display_title=v_segment\.title/);
  assert.match(publishBody, /display_body=v_segment\.public_prompt/);
  assert.equal(/display_[a-z_]*=v_segment\.correct_answer/.test(publishBody), false);
  assert.equal(/display_[a-z_]*=v_segment\.host_notes/.test(publishBody), false);
});
