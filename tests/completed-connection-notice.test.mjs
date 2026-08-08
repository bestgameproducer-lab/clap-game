import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);

test('双向确认完成后清除等待对方的顶部提示', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /const PENDING_CONNECTION_MESSAGE = '邀请已提交，等待对方打开页面接受。对方不需要再次输入你的编号。';/);
  assert.match(source, /relationship\.type === pendingNotice\.relationshipType[\s\S]*relationship\.status === 'PENDING'[\s\S]*relationship\.confirmedByMe/);
  assert.match(source, /if \(message !== expectedMessage \|\| !stillWaiting\) \{\s*setMessage\(''\);\s*setPendingNotice\(null\);/);
  assert.match(source, /await load\(\);\s*setPendingNotice\(status === 'PENDING' \? \{ kind: 'CONNECTION', relationshipType \} : null\);[\s\S]*setConnectionFeedback/);
});

test('等待型顶部提示在对应任务完成或结算后清除', async () => {
  const source = await readFile(guestPageUrl, 'utf8');

  assert.match(source, /pendingNotice\.kind === 'ASSIGNMENT_REVIEW'[\s\S]*assignment\.status === 'submitted'/);
  assert.match(source, /pendingNotice\.kind === 'MUTUAL_CONFIRMATION'[\s\S]*confirmation\.status === 'PENDING'/);
  assert.match(source, /pendingNotice\.kind === 'VOTE_RESULT'[\s\S]*!data\.game\?\.results_visible/);
  assert.match(source, /pendingNotice\.kind === 'PHASE_TWO_DILEMMA'[\s\S]*dilemma\?\.submitted && !data\.phaseTwo\.dilemma\.settled/);
  assert.match(source, /pendingNotice\.kind === 'PHASE_TWO_COPY'[\s\S]*copyChoice && !data\.phaseTwo\.copyChoice\.settled/);
  assert.match(source, /setPendingNotice\(payload\.action === 'dilemma' \? \{ kind: 'PHASE_TWO_DILEMMA' \} : \{ kind: 'PHASE_TWO_COPY' \}\);\s*setMessage\(success\);/);
});
