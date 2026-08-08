import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGuestPointLedger, buildGuestTeamScores } from '../lib/guest-score-core.ts';

test('guest point ledger uses task titles and hides unrevealed result powers', () => {
  const entries = [
    { id: 2, assignment_id: null, amount: 3, reason: '超级幸运星 · 第一阶段积分翻倍', created_at: '2026-07-31T12:00:00Z' },
    { id: 1, assignment_id: 'a1', amount: 2, reason: '现场核验通过', created_at: '2026-07-31T11:00:00Z' },
  ];
  const assignments = [{ id: 'a1', task: { title: '寻找星星伙伴' } }];
  assert.deepEqual(buildGuestPointLedger(entries, assignments, false).map((entry) => entry.label), ['第二幕系统奖励', '寻找星星伙伴']);
  assert.equal(buildGuestPointLedger(entries, assignments, true)[0].label, '超级幸运星 · 第一阶段积分翻倍');
});

test('guest team scores include both competitive teams and ignore unrelated groups', () => {
  assert.deepEqual(buildGuestTeamScores([
    { team: '海岛组', amount: 3 },
    { team: '海岛组', amount: 2 },
    { team: '沙漠组', amount: 4 },
    { team: '家人组', amount: 99 },
  ]), [{ team: '海岛组', points: 5 }, { team: '沙漠组', points: 4 }]);
});

test('guest score DTO excludes staff actors and exposes team scores only in team stages', async () => {
  const [dataSource, page] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(dataSource, /select\('id,assignment_id,amount,reason,created_at'\)/);
  assert.doesNotMatch(dataSource, /points_ledger'\)\.select\('[^']*actor/);
  assert.match(dataSource, /\['group_game', 'voting', 'results'\]\.includes\(game\.stage\)/);
  assert.match(page, /\['group_game', 'voting', 'results'\]\.includes\(data\.game\?\.stage \?\? ''\) \? data\.teamScores \?\? \[\] : \[\]/);
  assert.match(page, /查看我的积分流水/);
  assert.match(page, /团队实时积分/);
});
