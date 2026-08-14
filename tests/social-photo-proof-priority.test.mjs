import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guest = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../app/styles.css', import.meta.url), 'utf8');
const taskUi = await readFile(new URL('../lib/guest-task-ui.ts', import.meta.url), 'utf8');

test('first-meeting mission presents photo proof as the primary path', () => {
  assert.match(guest, /acceptsGuestPhotoEvidence/);
  assert.match(guest, /evidence-controls photo-primary-proof/);
  assert.match(guest, /guestPhotoEvidenceLabel/);
  assert.match(taskUi, /'P1-SOCIAL-001': '添加与新朋友的合影'/);
  assert.match(styles, /推荐完成方式 · 上传合影/);
  assert.match(styles, /\.photo-primary-proof \.evidence-file-trigger/);
  const missionRendering = guest.slice(guest.indexOf('dashboardAssignments.map'), guest.indexOf('{isActivePlayer && data.clues.length'));
  assert.ok(
    missionRendering.indexOf('renderEvidenceControls(assignment)') < missionRendering.indexOf('renderMutualConfirmation(assignment)'),
    'photo evidence controls must render before the player-code fallback',
  );
  assert.equal((missionRendering.match(/renderMutualConfirmation\(assignment\)/g) ?? []).length, 1);
});

test('player-code confirmation is a collapsed fallback rather than a competing action', () => {
  const fallback = guest.slice(guest.indexOf('function renderMutualConfirmation'), guest.indexOf('function renderSymbolPairing'));
  assert.match(fallback, /<details className="inline-mutual-confirmation"/);
  assert.match(fallback, /无法上传合影？/);
  assert.match(fallback, /改用玩家编号确认/);
  assert.doesNotMatch(fallback, /open=/);
  assert.doesNotMatch(fallback, /一起自拍/);
});
