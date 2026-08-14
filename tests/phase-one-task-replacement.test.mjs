import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the reunion photo mission is replaced forward-only with the couple photo mission', async () => {
  const [migration, specification] = await Promise.all([
    readFile(new URL('../supabase/migrations/202608020008_replace_reunion_photo_task.sql', import.meta.url), 'utf8'),
    readFile(new URL('../docs/phase-one-task-spec.md', import.meta.url), 'utf8'),
  ]);

  assert.match(migration, /where mission_code = 'P1-SOCIAL-002'/);
  assert.match(migration, /title = '拍摄一张新郎新娘同框的照片'/);
  assert.match(migration, /捕捉一张新郎和新娘同时入镜的照片/);
  assert.match(migration, /上传照片或向任务站工作人员出示照片/);
  assert.doesNotMatch(migration, /delete\s+from|truncate|update\s+public\.assignments/i);
  assert.match(specification, /P1-SOCIAL-002 \| 拍摄一张新郎新娘同框的照片 \| 3（金紫洋、沙漠组恶作剧者伪装、1 个受控随机名额） \| 2/);
  assert.doesNotMatch(specification, /和认识很久终于见面的朋友合影/);
});
