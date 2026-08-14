import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [guestPage, styles, migration] = await Promise.all([
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202607310030_explain_phase_two_awakenings.sql', import.meta.url), 'utf8'),
]);

test('unmatched symbol players are not told their act-two role before the reveal', () => {
  assert.match(guestPage, /awakeningRevealed[\s\S]*配对没有完成[\s\S]*丘比特还没有说出最后的答案/);
  assert.match(guestPage, /领航星已经觉醒/);
  assert.match(guestPage, /孤单丘比特已经觉醒/);
});

test('special awakenings override generic new-task notices and survive a closed page', () => {
  assert.match(guestPage, /function phaseTwoAwakening/);
  assert.match(guestPage, /decideGuestActivity\(/);
  assert.match(guestPage, /hasAwakening: Boolean\(awakening\)/);
  assert.match(guestPage, /createGuestActivityAck\(contentNotice\.snapshot\)/);
  assert.doesNotMatch(guestPage, /saved\.signature !== activitySignature/);
  assert.match(guestPage, /DESTINY AWAKENED/);
  assert.match(guestPage, /接受我的新命运/);
  assert.match(styles, /@keyframes destiny-awaken/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(guestPage, /\['COPY_SCORE', 'TEAM_CAPTAIN', 'EXTRA_VOTE', 'SUPER_LUCKY'\]/);
  assert.match(guestPage, /awakeningKind: 'CUPID_LUCKY_STAR'/);
  assert.match(guestPage, /丘比特的好运，终于落在你身上/);
  assert.match(guestPage, /awakeningKind: 'EXTRA_VOTE'/);
  assert.match(guestPage, /丘比特交给你第二次裁决/);
  assert.match(guestPage, /className="extra-vote-power-note"/);
  assert.match(guestPage, /额外一票已解锁/);
  assert.match(styles, /\.extra-vote-power-note/);
});

test('forward-only task copy explains why each unmatched player receives an ability', () => {
  assert.match(migration, /where mission_code='P2-LONELY-001'/);
  assert.match(migration, /第一幕没有找到爱心另一半，并不是任务失败/);
  assert.match(migration, /where mission_code='P2-GUIDE-001'/);
  assert.match(migration, /第一幕没有找到另一半星星，并不是任务失败/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table/);
});
