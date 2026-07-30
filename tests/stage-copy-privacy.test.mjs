import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin and guests share wedding-stage names and visible default prompts', async () => {
  const [stages, guest, admin] = await Promise.all([
    readFile(new URL('../lib/game-stages.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  for (const stage of ['registration', 'waiting', 'task_round_1', 'task_round_2', 'group_game', 'voting', 'results']) {
    assert.match(stages, new RegExp(`${stage}: \\{`));
  }
  assert.match(guest, /gameStageCopy\(data\.game\?\.stage\)/);
  assert.match(admin, /GAME_STAGE_OPTIONS, gameStageCopy/);
  assert.match(guest, /stage-default-prompt/);
  assert.match(admin, /宾客端默认提示/);
});

test('new guest content gets a transient notice without expanding tasks', async () => {
  const guest = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(guest, /contentSnapshotRef/);
  assert.match(guest, /window\.setTimeout\(\(\) => setContentNotice\(''\), 4200\)/);
  assert.match(guest, /className="new-content-toast"/);
  assert.match(guest, /expandedAssignments\[assignment\.id\] \?\? false/);
});

test('every secret card explains secrecy and tricksters receive a critical warning', async () => {
  const guest = await readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
  assert.match(guest, /全员保密规则/);
  assert.match(guest, /所有宾客共同规则/);
  assert.match(guest, /这是必须隐藏的身份/);
  assert.match(guest, /不要口头承认、不要展示本页、不要直接询问他人身份/);
  assert.match(guest, /reward-banner trickster-warning/);
});
