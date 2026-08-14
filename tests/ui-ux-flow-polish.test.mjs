import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest dashboard promotes one contextual action and collapses completed missions', async () => {
  const source = await read('app/guest/page.tsx');
  assert.match(source, /const primaryAction = data\.game\?\.results_visible/);
  assert.match(source, /data\.game\?\.voting_open && !data\.existingVote/);
  assert.match(source, /const incomingSymbolRelationships = incomingRelationships\.filter\(\(relationship\) => relationship\.type !== 'TRICKSTER_CONNECTION'\)/);
  assert.match(source, /incomingConfirmationCount \+ incomingSymbolRelationships\.length/);
  assert.match(source, /actionableIncomingConfirmationCount > 0/);
  assert.match(source, /const showPrimaryAction = !isFocusMode && \(actionableIncomingConfirmationCount > 0 \|\| Boolean\(rejectedAssignment\)\)/);
  assert.match(source, /assignment\.status === 'rejected' && isTaskActionOpenAtStage/);
  assert.match(source, /guest-primary-action/);
  assert.match(source, /completedMissionsOpen/);
  assert.match(source, /查看已完成任务/);
  assert.match(source, /usesTricksterFacade && secretReaderOpen \? trueTricksterAssignments : facadeAssignments/);
  assert.match(source, /trickster-real-mode-banner/);
  assert.match(source, /secretReaderOpen && incomingTricksterRelationship/);
  assert.match(source, /一项秘密同伴确认正在等待/);
});

test('host and administrator surfaces give stage-aware next-step guidance', async () => {
  const [host, admin] = await Promise.all([read('app/host/page.tsx'), read('app/admin/page.tsx')]);
  assert.match(host, /const hostGuidance = finalLocked/);
  assert.match(host, /host-guidance-card/);
  assert.match(host, /记录团队挑战成绩/);
  assert.match(admin, /const adminGuidance = !data\.preflight\.ready/);
  assert.match(admin, /admin-guidance-card/);
  assert.match(admin, /现场指挥/);
});

test('task station prioritizes pending guests and mobile selection moves to the workspace', async () => {
  const station = await read('app/station/page.tsx');
  assert.match(station, /guestFilter.*'pending'/);
  assert.match(station, /pendingGuestIds/);
  assert.match(station, /matchMedia\('\(max-width: 800px\)'\)/);
  assert.match(station, /workspaceRef\.current\?\.scrollIntoView/);
  assert.match(station, /当前没有待处理任务/);
});

test('shared visual system exposes focus, mobile hierarchy and reduced-motion states', async () => {
  const styles = await read('app/styles.css');
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /\.guest-primary-action/);
  assert.match(styles, /\.admin-guidance-card/);
  assert.match(styles, /\.host-guidance-card/);
  assert.match(styles, /\.station-filter-tabs/);
  assert.match(styles, /prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after/);
});

test('guest dashboard cards use one restrained wedding palette', async () => {
  const styles = await read('app/styles.css');
  const primaryAction = styles.slice(styles.indexOf('.guest-primary-action{'), styles.indexOf('.identity-game-rule{'));
  assert.match(primaryAction, /background:rgba\(255,252,248,.9\)/);
  assert.match(primaryAction, /\.guest-primary-action\.complete button\{border:1px solid #d8c7bd;background:#f2e8e1/);
  assert.doesNotMatch(primaryAction, /#526c58|#bed5c3|#e8f3ea/);
  assert.match(styles, /\.reward-banner \{[^}]*background:rgba\(255,252,248,.9\)/);
  assert.match(styles, /\.reward-banner::before\{[^}]*content:'✦'/);
  assert.match(styles, /\.section-card \{[^}]*background: rgba\(255,252,249,.92\)/);
  assert.match(styles, /\.reward-banner\.trickster-warning::before\{display:none\}/);
});
