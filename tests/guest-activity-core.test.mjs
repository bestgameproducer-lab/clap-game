import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  activitySignature,
  copyTextWithFallback,
  createGuestActivityAck,
  decideGuestActivity,
  parseGuestActivityAck,
} from '../lib/guest-activity-core.ts';

function snapshot(overrides = {}) {
  return {
    guestId: 'guest-a',
    rehearsalRunId: 'run-a',
    stage: 'task_round_1',
    phaseNote: '',
    awakeningKey: '',
    dilemmaKey: '',
    copyKey: '',
    assignmentIds: ['assignment-a'],
    assignmentStatuses: { 'assignment-a': 'assigned' },
    clueIds: [],
    confirmationIds: [],
    relationshipIds: [],
    ...overrides,
  };
}

test('activity signatures are stable when set-like fields arrive in a different order', () => {
  const first = snapshot({
    assignmentIds: ['assignment-b', 'assignment-a'],
    assignmentStatuses: { 'assignment-b': 'approved', 'assignment-a': 'assigned' },
    clueIds: ['clue-b', 'clue-a'],
    relationshipIds: ['relationship-b', 'relationship-a'],
  });
  const second = snapshot({
    assignmentIds: ['assignment-a', 'assignment-b'],
    assignmentStatuses: { 'assignment-a': 'assigned', 'assignment-b': 'approved' },
    clueIds: ['clue-a', 'clue-b'],
    relationshipIds: ['relationship-a', 'relationship-b'],
  });
  assert.equal(activitySignature(first), activitySignature(second));
});

test('incoming relationship invitations are surfaced once and accepting them is quiet', () => {
  const before = snapshot();
  const invited = snapshot({ relationshipIds: ['relationship-a'] });
  assert.deepEqual(decideGuestActivity({
    current: invited,
    previous: before,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'relationship-new', relationshipId: 'relationship-a' });
  assert.deepEqual(decideGuestActivity({
    current: snapshot(),
    previous: invited,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'none', shouldBaseline: true });
});

test('self task submissions baseline quietly while later approval still reports an update', () => {
  const assigned = snapshot();
  const submitted = snapshot({ assignmentStatuses: { 'assignment-a': 'submitted' } });
  assert.deepEqual(decideGuestActivity({
    current: submitted,
    previous: assigned,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
    suppress: { assignmentId: 'assignment-a' },
  }), { kind: 'none', shouldBaseline: true });
  assert.deepEqual(decideGuestActivity({
    current: snapshot({ assignmentStatuses: { 'assignment-a': 'approved' } }),
    previous: submitted,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'assignment-updated', assignmentId: 'assignment-a' });
});

test('self submission suppression never hides a simultaneous external update', () => {
  assert.deepEqual(decideGuestActivity({
    current: snapshot({
      assignmentStatuses: { 'assignment-a': 'submitted' },
      clueIds: ['clue-a'],
    }),
    previous: snapshot(),
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
    suppress: { assignmentId: 'assignment-a' },
  }), { kind: 'clue-new', clueId: 'clue-a' });
});

test('self dilemma and copy submissions are quiet but their settled results are not', () => {
  const before = snapshot();
  const dilemmaWaiting = snapshot({ dilemmaKey: 'HEART:waiting:LOVE' });
  assert.deepEqual(decideGuestActivity({
    current: dilemmaWaiting,
    previous: before,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
    suppress: { dilemma: true },
  }), { kind: 'none', shouldBaseline: true });
  assert.deepEqual(decideGuestActivity({
    current: snapshot({ dilemmaKey: 'HEART:settled:LOVE:HATE:0:5' }),
    previous: dilemmaWaiting,
    hasAwakening: false,
    hasDilemmaResult: true,
    drawn: true,
  }), { kind: 'dilemma-result' });

  const copyWaiting = snapshot({ copyKey: 'guest-b:waiting:' });
  assert.deepEqual(decideGuestActivity({
    current: copyWaiting,
    previous: before,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
    suppress: { copy: true },
  }), { kind: 'none', shouldBaseline: true });
});

test('a stage transition, awakening and new assignment are reported together', () => {
  assert.deepEqual(decideGuestActivity({
    current: snapshot({
      stage: 'task_round_2',
      awakeningKey: 'TEAM_CAPTAIN:now',
      assignmentIds: ['assignment-a', 'assignment-b'],
      assignmentStatuses: { 'assignment-a': 'approved', 'assignment-b': 'assigned' },
    }),
    previous: snapshot({ assignmentStatuses: { 'assignment-a': 'approved' } }),
    hasAwakening: true,
    hasDilemmaResult: false,
    drawn: true,
  }), {
    kind: 'activity-bundle',
    awakening: true,
    dilemmaResult: false,
    stage: true,
    assignment: true,
    assignmentId: 'assignment-b',
  });
});

test('clipboard copy awaits the browser result, falls back, and never reports false success', async () => {
  let fallbackCalls = 0;
  assert.equal(await copyTextWithFallback('K7M4', {
    writeText: async () => {},
    fallbackCopy: () => { fallbackCalls += 1; return true; },
  }), true);
  assert.equal(fallbackCalls, 0);

  assert.equal(await copyTextWithFallback('K7M4', {
    writeText: async () => { throw new Error('not allowed'); },
    fallbackCopy: () => true,
  }), true);
  assert.equal(await copyTextWithFallback('K7M4', {
    writeText: async () => { throw new Error('not allowed'); },
    fallbackCopy: () => false,
  }), false);
});

test('an acknowledged awakening does not repeat when an unrelated field changes', () => {
  const awakened = snapshot({ awakeningKey: 'TEAM_CAPTAIN:now' });
  const ack = createGuestActivityAck(awakened);
  const decision = decideGuestActivity({
    current: snapshot({ awakeningKey: 'TEAM_CAPTAIN:now', phaseNote: '请集合队友' }),
    ack,
    hasAwakening: true,
    hasDilemmaResult: false,
    drawn: true,
  });
  assert.deepEqual(decision, { kind: 'phase-note' });
});

test('a newly unlocked awakening preserves the simultaneous task update', () => {
  const ack = createGuestActivityAck(snapshot());
  const decision = decideGuestActivity({
    current: snapshot({
      awakeningKey: 'COPY_SCORE:now',
      assignmentIds: ['assignment-a', 'assignment-b'],
      assignmentStatuses: { 'assignment-a': 'assigned', 'assignment-b': 'assigned' },
    }),
    ack,
    hasAwakening: true,
    hasDilemmaResult: false,
    drawn: true,
  });
  assert.deepEqual(decision, {
    kind: 'activity-bundle',
    awakening: true,
    dilemmaResult: false,
    stage: false,
    assignment: true,
  });
});

test('a newly settled dilemma takes priority and does not repeat after acknowledgement', () => {
  const before = snapshot({ dilemmaKey: 'HEART:waiting:LOVE' });
  const settled = snapshot({ dilemmaKey: 'HEART:settled:LOVE:HATE:0:5', phaseNote: '晚宴开始' });
  assert.deepEqual(decideGuestActivity({
    current: settled,
    previous: before,
    hasAwakening: false,
    hasDilemmaResult: true,
    drawn: true,
  }), { kind: 'dilemma-result' });
  assert.deepEqual(decideGuestActivity({
    current: settled,
    ack: createGuestActivityAck(settled),
    hasAwakening: false,
    hasDilemmaResult: true,
    drawn: true,
  }), { kind: 'none', shouldBaseline: false });
});

test('activity acknowledgements never cross a rehearsal reset', () => {
  const ack = createGuestActivityAck(snapshot());
  assert.deepEqual(decideGuestActivity({
    current: snapshot({ rehearsalRunId: 'run-b' }),
    ack,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'welcome' });
  assert.deepEqual(decideGuestActivity({
    current: snapshot({ rehearsalRunId: 'run-b' }),
    ack,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: false,
  }), { kind: 'none', shouldBaseline: true });
});

test('malformed and legacy acknowledgements are rejected and repaired through a baseline', () => {
  assert.equal(parseGuestActivityAck('{not-json'), null);
  assert.equal(parseGuestActivityAck(JSON.stringify({ guestKey: 'legacy', signature: 'old' })), null);
  assert.deepEqual(decideGuestActivity({
    current: snapshot(),
    ack: parseGuestActivityAck(JSON.stringify({ guestKey: 'legacy', signature: 'old' })),
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: false,
  }), { kind: 'none', shouldBaseline: true });
  assert.deepEqual(parseGuestActivityAck(JSON.stringify(createGuestActivityAck(snapshot()))), createGuestActivityAck(snapshot()));
});

test('closing a notice acknowledges its own snapshot, not a newer poll', () => {
  const noticeSnapshot = snapshot();
  const newerSnapshot = snapshot({
    assignmentIds: ['assignment-a', 'assignment-b'],
    assignmentStatuses: { 'assignment-a': 'assigned', 'assignment-b': 'assigned' },
  });
  const ack = createGuestActivityAck(noticeSnapshot);
  assert.deepEqual(decideGuestActivity({
    current: newerSnapshot,
    ack,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'assignment-change' });
});

test('live comparisons require both the same guest and the same rehearsal run', () => {
  assert.deepEqual(decideGuestActivity({
    current: snapshot({ rehearsalRunId: 'run-b' }),
    previous: snapshot({ rehearsalRunId: 'run-a', stage: 'registration' }),
    ack: null,
    hasAwakening: false,
    hasDilemmaResult: false,
    drawn: true,
  }), { kind: 'welcome' });
});

test('guest activity dialogs share scroll locking and Escape dismissal', async () => {
  const page = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /pageScrollLocked = dinnerMenuOpen \|\| playerDirectoryOpen \|\| scoreLedgerOpen \|\| Boolean\(contentNotice\)/);
  assert.match(page, /if \(contentNotice\) acknowledgeContentNotice\(\)/);
  assert.match(page, /else if \(playerDirectoryOpen\) setPlayerDirectoryOpen\(false\)/);
  assert.match(page, /else if \(scoreLedgerOpen\) setScoreLedgerOpen\(false\)/);
  assert.match(page, /contentNoticeRef\.current = nextNotice/);
  assert.match(page, /contentSnapshotRef\.current = contentNotice\.snapshot/);
  assert.match(page, /assignment\.task\.category === 'hidden'/);
  assert.doesNotMatch(page, /restoreCachedSession|GUEST_CACHE_KEY|sessionStorage\.setItem/);
  assert.match(page, /LEGACY_PRIVATE_SESSION_KEYS/);
  assert.match(page, /sessionStorage\.removeItem\(key\)/);
  assert.match(page, /hasServerConfirmedDataRef/);
  assert.match(page, /联网确认前不能提交操作/);
  assert.match(page, /为避免显示上一轮的任务或线索，请联网后重试/);
  assert.match(page, /const READ_REQUEST_TIMEOUT_MS = 10_000/);
  assert.match(page, /fetch\('\/api\/guest-me', \{ cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(page, /fetch\('\/api\/registration\/guests', \{ cache: 'no-store', signal: controller\.signal \}\)/);
  assert.match(page, /checking \|\| \(!data && deviceAccessChecking\)/);
});
