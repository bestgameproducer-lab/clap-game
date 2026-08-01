import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('guest dashboard promotes one contextual action and collapses completed missions', async () => {
  const source = await read('app/guest/page.tsx');
  assert.match(source, /const primaryAction = data\.game\?\.results_visible/);
  assert.match(source, /data\.game\?\.voting_open && !data\.existingVote/);
  assert.match(source, /incomingConfirmationCount > 0/);
  assert.match(source, /guest-primary-action/);
  assert.match(source, /completedMissionsOpen/);
  assert.match(source, /查看已完成任务/);
  assert.match(source, /usesTricksterFacade && secretReaderOpen\) return <main className="trickster-private-shell"/);
});

test('host and administrator surfaces give stage-aware next-step guidance', async () => {
  const [host, admin] = await Promise.all([read('app/host/page.tsx'), read('app/admin/page.tsx')]);
  assert.match(host, /const hostGuidance = data\?\.game\?\.results_visible/);
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
