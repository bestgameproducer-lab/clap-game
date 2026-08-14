import assert from 'node:assert/strict';
import test from 'node:test';

import {
  phaseOneInteractionClosedMessage,
  taskActionClosedMessage,
} from '../lib/game-rules.ts';

test('closed task action messages describe the correct wedding window', () => {
  assert.match(taskActionClosedMessage('task_round_1', '提交'), /宾客签到、等待仪式/);
  assert.match(taskActionClosedMessage('task_round_1', '照片上传'), /仪式结束后至团队挑战/);
  assert.match(taskActionClosedMessage('task_round_2', '提交'), /婚宴前奏、婚宴和团队挑战/);
  assert.doesNotMatch(taskActionClosedMessage('task_round_2', '提交'), /仪式前/);
  assert.match(taskActionClosedMessage('group_game', '照片上传'), /团队任务只在团队挑战期间/);
  assert.match(taskActionClosedMessage('unknown', '提交'), /联系现场工作人员/);
});

test('pairing copy explains the recovery window', () => {
  assert.match(phaseOneInteractionClosedMessage('伙伴确认'), /仪式前与仪式结束后至最终投票前/);
});
