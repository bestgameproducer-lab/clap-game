import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  acceptsGuestSelfSubmission,
  acceptsGuestPhotoEvidence,
  guestCompletionNotePlaceholder,
  guestMissionRewardLabel,
  guestPhotoEvidenceLabel,
  LIVE_GUEST_PHOTO_EVIDENCE_MISSION_CODES,
  requiresGuestPhotoBeforeSubmission,
} from '../lib/guest-task-ui.ts';
import { OFFICIAL_TASK_MANIFEST } from '../lib/official-task-manifest.ts';

const expectedPhotoCodes = [
  'P1-SOCIAL-001',
  'P1-SOCIAL-002',
  'P2-SOCIAL-001',
  'P2-SOCIAL-002',
  'P2-SOCIAL-003',
  'P2-SOCIAL-004',
];

const expectedSubmissionCodes = [
  ...expectedPhotoCodes,
  'P1-CER-001',
  'P1-CER-002',
  'P1-CER-003',
  'P1-CER-004',
  'P2-CEREMONY-001',
];

test('all 22 official tasks expose photo controls only when their proof contract accepts a photo', () => {
  assert.equal(OFFICIAL_TASK_MANIFEST.length, 22);
  assert.deepEqual([...LIVE_GUEST_PHOTO_EVIDENCE_MISSION_CODES].sort(), expectedPhotoCodes.sort());
  for (const task of OFFICIAL_TASK_MANIFEST) {
    assert.equal(
      acceptsGuestPhotoEvidence({
        missionCode: task.mission_code,
        mechanic: task.mechanic,
        catalogMode: 'live',
      }),
      expectedPhotoCodes.includes(task.mission_code),
      task.mission_code,
    );
    assert.equal(
      acceptsGuestSelfSubmission({ missionCode: task.mission_code, mechanic: task.mechanic, catalogMode: 'live' }),
      expectedSubmissionCodes.includes(task.mission_code),
      `${task.mission_code} guest submission`,
    );
  }
  assert.equal(acceptsGuestPhotoEvidence({ missionCode: null, mechanic: 'STANDARD', catalogMode: 'demo' }), true);
  assert.equal(acceptsGuestPhotoEvidence({ missionCode: null, mechanic: 'SECRET_DILEMMA', catalogMode: 'demo' }), false);
  assert.equal(acceptsGuestPhotoEvidence({ missionCode: null, mechanic: 'STANDARD', catalogMode: null }), false);
  assert.equal(acceptsGuestSelfSubmission({ missionCode: null, mechanic: 'STANDARD', catalogMode: null }), false);
});

test('theme-photo missions cannot claim completion before the required photo exists', () => {
  assert.equal(requiresGuestPhotoBeforeSubmission('P2-SOCIAL-003'), true);
  assert.equal(requiresGuestPhotoBeforeSubmission('P2-SOCIAL-004'), true);
  for (const task of OFFICIAL_TASK_MANIFEST.filter((candidate) => !['P2-SOCIAL-003', 'P2-SOCIAL-004'].includes(candidate.mission_code))) {
    assert.equal(requiresGuestPhotoBeforeSubmission(task.mission_code), false, task.mission_code);
  }
  assert.match(guestPhotoEvidenceLabel('P2-SOCIAL-003', false), /主题合影（必需）/);
});

test('completion-note prompts match the official task instead of calling every mission a photo mission', () => {
  assert.match(guestCompletionNotePlaceholder('P1-CER-001'), /誓词引导/);
  assert.match(guestCompletionNotePlaceholder('P1-CER-002'), /戒指/);
  assert.match(guestCompletionNotePlaceholder('P2-CEREMONY-001'), /晚宴致辞/);
  assert.match(guestCompletionNotePlaceholder('P1-SOCIAL-002'), /新郎新娘同框/);
  assert.doesNotMatch(guestCompletionNotePlaceholder('P1-CER-001'), /合影/);
});

test('zero-point official missions explain their real reward instead of displaying zero points', () => {
  const labels = new Map(OFFICIAL_TASK_MANIFEST.map((task) => [
    task.mission_code,
    guestMissionRewardLabel({
      points: task.points,
      missionCode: task.mission_code,
      mechanic: task.mechanic,
      scorePolicy: task.score_policy,
    }),
  ]));

  assert.equal(labels.get('P2-HEART-001'), '按选择结算');
  assert.equal(labels.get('P2-STAR-001'), '按选择结算');
  assert.equal(labels.get('P2-LONELY-001'), '偷心行动');
  assert.equal(labels.get('P2-GUIDE-001'), '团队奖励');
  assert.equal(labels.get('P1-TRICKSTER-001'), '能力解锁');
  assert.equal(labels.get('P2-TRICKSTER-001'), '身份任务');
  assert.equal(labels.get('P2-POWER-001'), '额外一票');
  assert.equal(labels.get('P2-LUCKY-001'), '快照 + 2');
  for (const task of OFFICIAL_TASK_MANIFEST.filter((candidate) => candidate.points === 0)) {
    assert.notEqual(labels.get(task.mission_code), '0 分', task.mission_code);
  }
  assert.equal(labels.get('P1-CER-001'), '5 分');
});

test('guest proof actions fail beside their task and server routes enforce the same boundary', async () => {
  const [page, evidence, guestData] = await Promise.all([
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/evidence.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /assignmentActionErrors/);
  assert.match(page, /voteError/);
  assert.match(page, /phaseTwoActionError/);
  assert.match(page, /mutualResponseErrors/);
  assert.match(page, /role="alert"/);
  assert.match(page, /确认已处理，相关任务状态已刷新/);
  assert.match(evidence, /acceptsGuestPhotoEvidence/);
  assert.equal((evidence.match(/await requireEditableGuestAssignment\(assignmentId, guestId\)/g) ?? []).length, 2);
  assert.match(guestData, /requiresGuestPhotoBeforeSubmission/);
  assert.match(guestData, /acceptsGuestSelfSubmission/);
  assert.match(guestData, /这项任务由主持人或系统确认/);
  assert.match(guestData, /请先上传本任务要求的主题合影/);
});

test('activity dialogs return guests to the affected stage, task, request, or clue', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /focusTarget\?: 'guest-stage' \| 'guest-missions' \| 'guest-confirmations' \| 'guest-clues'/);
  assert.match(page, /focusAssignmentId/);
  assert.match(page, /document\.getElementById\(focusTarget\)\?\.scrollIntoView/);
  assert.match(page, /id="guest-clues"/);
});
