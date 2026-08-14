import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isOfficialWeddingMissionCode,
  isTaskAllowedInCatalogMode,
} from '../lib/official-task-manifest.ts';
import { buildGuestPointLedger } from '../lib/guest-score-core.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('live view accepts only exact official mission codes while demo keeps custom tasks', () => {
  assert.equal(isOfficialWeddingMissionCode('P1-SOCIAL-001'), true);
  assert.equal(isOfficialWeddingMissionCode('P2-TRICKSTER-001'), true);
  assert.equal(isOfficialWeddingMissionCode('P2-REPORTER-LEGACY'), false);
  assert.equal(isOfficialWeddingMissionCode(null), false);

  assert.equal(isTaskAllowedInCatalogMode({ mission_code: 'P1-SOCIAL-001' }, 'live'), true);
  assert.equal(isTaskAllowedInCatalogMode([{ mission_code: 'P2-REPORTER-LEGACY' }], 'live'), false);
  assert.equal(isTaskAllowedInCatalogMode({ mission_code: null }, 'live'), false);
  assert.equal(isTaskAllowedInCatalogMode({ mission_code: null }, 'demo'), true);
});

test('live guest point ledger cannot recover a retired task title through the raw assignment map', () => {
  const rawAssignments = [
    { id: 'official', task: { mission_code: 'P1-SOCIAL-001', title: '正式任务' } },
    { id: 'legacy', task: { mission_code: 'P2-REPORTER-LEGACY', title: '婚礼记者' } },
  ];
  const allowedAssignments = rawAssignments.filter((assignment) => (
    isTaskAllowedInCatalogMode(assignment.task, 'live')
  ));
  const ledger = buildGuestPointLedger([
    { id: 1, assignment_id: 'official', amount: 2, reason: '正式任务核验', created_at: '2026-08-13T00:00:00Z' },
    { id: 2, assignment_id: 'legacy', amount: 2, reason: '历史积分记录', created_at: '2026-08-12T00:00:00Z' },
  ], allowedAssignments, false);

  assert.deepEqual(ledger.map((entry) => entry.label), ['正式任务', '历史积分记录']);
  assert.equal(ledger.some((entry) => entry.label === '婚礼记者'), false);
});

test('every guest-facing and ranking DTO applies the formal catalog boundary', async () => {
  const [guest, station, publicData, host, admin] = await Promise.all([
    read('lib/data/guest.ts'),
    read('lib/data/station.ts'),
    read('lib/data/public.ts'),
    read('lib/data/host.ts'),
    read('lib/data/admin.ts'),
  ]);

  for (const source of [guest, station, publicData, host, admin]) {
    assert.match(source, /isTaskAllowedInCatalogMode/);
  }
  assert.match(publicData, /task:tasks!assignments_task_id_fkey\(mission_code\)/);
  assert.match(host, /task:tasks!assignments_task_id_fkey\(mission_code\)/);
  assert.match(station, /task\?\.category !== 'hidden'[\s\S]*?isTaskAllowedInCatalogMode/);
  assert.match(guest, /catalogAssignments[\s\S]*?isTaskAllowedInCatalogMode\(assignment\.task, game\.task_catalog_mode\)[\s\S]*?visibleAssignments = catalogAssignments\.filter[\s\S]*?isAssignmentVisibleAtStage/);
  assert.match(guest, /buildGuestPointLedger\(pointLedgerResult\.data \?\? \[\], visibleAssignments, game\.results_visible\)/);
  assert.match(admin, /rankingAssignments[\s\S]*?isTaskAllowedInCatalogMode\(assignment\.task, game\?\.task_catalog_mode\)/);
  assert.match(publicData, /eq\('active', true\)\.eq\('uses_app', true\)\.eq\('participation_mode', 'ACTIVE_PLAYER'\)\.eq\('phase_two_eligible', true\)/);
  assert.match(publicData, /eq\('role', 'spy'\)\.eq\('is_hidden_spy', false\)/);
  assert.match(host, /tricksters: game\.data\?\.results_visible \? eligibleTeamTricksters\.map/);
  assert.match(admin, /guest\.active && guest\.uses_app[\s\S]*?guest\.participation_mode === 'ACTIVE_PLAYER' && guest\.phase_two_eligible/);
  assert.match(admin, /retiredApprovedAssignments[\s\S]*?assignment\.status === 'approved'[\s\S]*?!isTaskAllowedInCatalogMode/);
  assert.match(admin, /id: 'retired-live-task-runtime'[\s\S]*?请在正式开放前执行彩排清场/);
  const printable = admin.slice(admin.indexOf('export async function getPrintableMissionCards'), admin.indexOf('export async function approveAssignment'));
  assert.match(printable, /neq\('status', 'cancelled'\)/);
  assert.match(printable, /order\('created_at', \{ ascending: false \}\)/);
  assert.match(printable, /isTaskAllowedInCatalogMode\(assignment\.task, game\.task_catalog_mode\)/);
});
