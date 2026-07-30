import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/host-action/route.ts', import.meta.url), 'utf8');
const data = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/202607300004_host_score_controls.sql', import.meta.url), 'utf8');

test('host UI exposes only team and personal score controls', () => {
  assert.match(page, /团队加分/);
  assert.match(page, /个人加分/);
  assert.match(page, /type: 'adjustTeamPoints'/);
  assert.match(page, /type: 'adjustGuestPoints'/);
  assert.match(page, /pendingScoreRef\.current\?\.signature === signature/);
  assert.match(page, /createEventKey\(\)/);
  for (const hidden of ['流程题库','发布到大屏','资源竞拍钱包','正确答案','揭晓票数']) assert.doesNotMatch(page, new RegExp(hidden));
});

test('host score mutations are authenticated, same-origin, validated, and idempotent', () => {
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const actor = await requireAdmin\(\)/);
  assert.match(route, /requiredInteger\(body\.amount, '团队加分', 1, 100\)/);
  assert.match(route, /requiredInteger\(body\.amount, '个人加分', 1, 100\)/);
  assert.match(route, /requiredUuid\(body\.eventKey, '幂等事件 ID'\)/);
  assert.doesNotMatch(route, /saveSegment|publishSegment|adjustResources/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtext\('host-score:'\|\|p_event_key::text\)\)/);
  assert.match(migration, /score_event_conflict/);
  assert.match(migration, /event_key uuid/);
});

test('team and personal scores stay in separate audited ledgers', () => {
  assert.match(migration, /insert into team_points_ledger\(team,amount,reason,event_key,actor\)/);
  assert.match(migration, /insert into points_ledger\(guest_id,amount,reason,event_key,actor\)/);
  assert.match(migration, /host\.team_points_add/);
  assert.match(migration, /host\.guest_points_add/);
  assert.match(migration, /eligible_for_personal_score/);
});

test('host data is a minimal explicit scoring DTO', () => {
  assert.match(data, /select\('id,name,team,points,participation_mode,special_card_title'\)/);
  assert.match(data, /select\('id,team,amount,reason,created_at'\)/);
  assert.match(data, /select\('id,guest_id,amount,reason,created_at,guest:guests\(id,name\)'\)/);
  const scoreDto = data.slice(data.indexOf('export async function getHostDashboardData'), data.indexOf('export async function adjustHostTeamPoints'));
  assert.doesNotMatch(scoreDto, /correct_answer|host_notes|team_resources|votes/);
});
