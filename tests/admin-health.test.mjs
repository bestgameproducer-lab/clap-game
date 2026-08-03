import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin dashboard exposes a server-authenticated wedding-day health summary', async () => {
  const [data, page] = await Promise.all([
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(data, /database: 'online' as const/);
  assert.match(data, /checkedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(data, /deploymentVersion: DEPLOYMENT_VERSION/);
  assert.match(page, /婚礼日状态/);
  assert.match(page, /数据库已连接/);
  assert.match(page, /data\.health\.deploymentVersion\.slice\(0, 12\)/);
  assert.match(page, /\{claimed\}\/\{activeGuests\.length\} 认领/);
});
