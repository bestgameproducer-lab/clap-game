import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const guestPage = readFileSync(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const activityCore = readFileSync(new URL('../lib/guest-activity-core.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/styles.css', import.meta.url), 'utf8');

test('升级任务结算拥有独立活动指纹并优先于普通任务状态更新', () => {
  assert.match(activityCore, /dilemmaKey: string/);
  assert.match(activityCore, /hasDilemmaResult && current\.dilemmaKey && ack\.dilemmaKey !== current\.dilemmaKey/);
  assert.match(activityCore, /hasDilemmaResult && after\.dilemmaKey && before\.dilemmaKey !== after\.dilemmaKey[\s\S]*?before\.stage/);
  assert.match(guestPage, /createGuestActivityAck\(contentNotice\.snapshot\)/);
});

test('爱心和星星四种结算结果使用中立叙事，不在结算前泄露伙伴选择', () => {
  for (const title of ['爱心守住了彼此', '两颗星光并肩抵达', '你握住了丘比特的筹码', '你独自带走了星光', '两颗心在岔路口错开', '星光在岔路口分开', '两颗爱心都保留了秘密', '两颗星光各自远行']) {
    assert.match(guestPage, new RegExp(title));
  }
  assert.match(guestPage, /partnerChoice: string \| null/);
  assert.match(guestPage, /if \(dilemma\?\.submitted\)[\s\S]*等待伙伴提交后，系统才会同时揭晓结果/);
  assert.match(guestPage, /variant: 'dilemma-result'/);
  assert.match(guestPage, /收下结果 · 返回任务/);
});

test('结算特效区分相遇、胜负和各自保留，并尊重减少动态效果偏好', () => {
  assert.match(css, /\.dilemma-result\.mutual-trust/);
  assert.match(css, /\.dilemma-result\.personal-win/);
  assert.match(css, /\.dilemma-result\.partner-win/);
  assert.match(css, /\.dilemma-result\.mutual-guarded/);
  assert.match(css, /prefers-reduced-motion:reduce[\s\S]*\.new-content-dialog\.dilemma-result/);
});
