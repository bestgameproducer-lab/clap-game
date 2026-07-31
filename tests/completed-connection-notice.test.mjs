import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('双向确认完成后清除等待对方的顶部提示', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /const PENDING_CONNECTION_MESSAGE = '你的编号确认已提交，等待对方输入你的玩家编号。';/);
  assert.match(source, /relationship\.type === pendingConnectionType[\s\S]*relationship\.status === 'PENDING'[\s\S]*relationship\.confirmedByMe/);
  assert.match(source, /if \(!stillWaiting\) \{\s*setMessage\(''\);\s*setPendingConnectionType\(null\);/);
  assert.match(source, /await load\(\);\s*setPendingConnectionType\(status === 'PENDING' \? relationshipType : null\);\s*setMessage\(/);
});
