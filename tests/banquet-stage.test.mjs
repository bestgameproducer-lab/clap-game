import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isTaskActionOpenAtStage, isTaskVisibleAtStage } from '../lib/game-rules.ts';

const migrationUrl = new URL('../supabase/migrations/202608010008_add_banquet_game_stage.sql', import.meta.url);

test('wedding timeline separates round-two release from the actual dinner', async () => {
  const [stages, admin, host] = await Promise.all([
    readFile(new URL('../lib/game-stages.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(stages, /title: '婚宴前奏'[\s\S]*roundLabel: '第二轮任务发放'/);
  assert.match(stages, /banquet: \{[\s\S]*title: '婚宴开始'[\s\S]*roundLabel: '第二轮任务进行中'/);
  assert.match(admin, /gameStageCopy\(stage\)\.title/);
  assert.match(admin, /gameStageCopy\(stage\)\.roundLabel/);
  assert.match(host, /gameStageCopy\(stage\)\.title/);
  assert.match(host, /gameStageCopy\(stage\)\.roundLabel/);
});

test('banquet keeps second-round work open without reallocating missions', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.equal(isTaskVisibleAtStage('task_round_2', 'banquet'), true);
  assert.equal(isTaskActionOpenAtStage('task_round_2', 'banquet'), true);
  assert.equal(isTaskActionOpenAtStage('group_game', 'banquet'), false);
  assert.match(migration, /stage in \('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game','voting','results'\)/);
  assert.match(migration, /v_state\.stage not in \('task_round_2','banquet','group_game','voting','results'\)/);
  assert.match(migration, /submit_phase_two_dilemma\(uuid,text\)/);
  assert.match(migration, /redeem_hidden_task_code\(uuid,text,text\)/);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/);
});
