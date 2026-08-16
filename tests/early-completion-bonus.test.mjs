import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290038_early_completion_bonus.sql', import.meta.url);

test('the first three initial finishers receive one explicit idempotent bonus point', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /add column if not exists early_bonus_points integer not null default 0/);
  assert.match(migration, /check \(early_bonus_points in \(0,1\)\)/);
  const approval = migration.slice(migration.indexOf('create or replace function approve_assignment_with_verification'));
  const baseApproval = approval.indexOf('v_result:=approve_assignment');
  const guardedMarker = approval.indexOf('where id=p_assignment_id and early_bonus_points=0');
  const bonusLedger = approval.indexOf("values(v_guest_id,1,'首轮任务前三名额外奖励',p_actor)");
  const guestTotal = approval.indexOf('update guests set points=points+1');
  assert.ok(baseApproval > 0 && guardedMarker > baseApproval && bonusLedger > guardedMarker && guestTotal > bonusLedger);
  assert.match(approval, /if v_rank between 1 and 3 then/);
  assert.match(approval, /'assignment\.early_bonus'/);
  assert.match(approval, /'early_bonus_points',v_bonus_awarded/);
});

test('migration safely backfills prior top-three approvals once', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const backfill = migration.slice(0, migration.indexOf('create or replace function approve_assignment_with_verification'));
  assert.match(backfill, /status='approved' and completion_rank between 1 and 3 and early_bonus_points=0/);
  assert.match(backfill, /update assignments set early_bonus_points=1/);
  assert.match(backfill, /migration:202607290038/);
  assert.doesNotMatch(backfill, /delete from|truncate/);
});

test('bonus is visible to the guest, task station, and assignment export', async () => {
  const [guestData, guestPage, stationData, stationPage, exportData] = await Promise.all([
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/station.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(guestData, /completion_rank,early_bonus_points,reward_task_id/);
  assert.match(guestPage, /抢先核验奖励：额外 1 分已经计入你的个人积分/);
  assert.doesNotMatch(guestPage, /升级任务、\$\{rankedReward\.early_bonus_points/);
  assert.match(stationData, /completion_rank,early_bonus_points,completion_note/);
  assert.match(stationPage, /额外 \+1/);
  assert.match(exportData, /'前三额外积分'/);
});
