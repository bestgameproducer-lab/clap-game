import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607300001_phase_one_real_missions.sql', import.meta.url);

test('social missions support bounded mutual confirmation with atomic completion', async () => {
  const [migration, route, guestData, guestPage, styles] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../app/api/mutual-confirmation/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /create table if not exists assignment_mutual_confirmations/);
  assert.match(migration, /count\(\*\) from assignment_mutual_confirmations where confirmer_guest_id=v_target\.id and status='ACTIVE'\)>=2/);
  assert.match(migration, /perform approve_assignment\(v_confirmation\.assignment_id,'system:mutual-confirmation'/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const guestId = await requireGuest\(\)/);
  assert.match(guestData, /guest\.hidden_role === 'CUPID_HELPER'/);
  assert.match(guestPage, /renderMutualConfirmation\(assignment\)/);
  assert.match(guestPage, /className="inline-mutual-confirmation"/);
  assert.match(guestPage, /输入玩家编号/);
  assert.match(guestPage, /📷 一起自拍/);
  assert.match(guestPage, /选择或拍摄合影/);
  assert.doesNotMatch(guestPage, /<h2>请新朋友确认<\/h2>/);
  assert.match(styles, /\.inline-mutual-confirmation/);
  assert.match(styles, /\.mission-proof-divider/);
  assert.match(guestPage, /好友确认请求/);
});

test('ceremony assignments track ring custody and operational progress', async () => {
  const [migration, adminRoute, adminPage] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /ceremony_status in \('LOCKED','AVAILABLE','BRIEFED','RING_RECEIVED','IN_PROGRESS','DELIVERED','COMPLETED'\)/);
  assert.match(migration, /ring_variant in \('GROOM_RING','BRIDE_RING'\)/);
  assert.match(migration, /create or replace function update_ceremony_assignment/);
  assert.match(migration, /'assignment\.ceremony_status'/);
  assert.match(adminRoute, /type === 'updateCeremonyAssignment'/);
  assert.match(adminPage, /仪式任务流程/);
});

test('task reassignment cancels the prior task while retaining linked audit history', async () => {
  const [migration, adminData, adminPage] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /replacement_for_assignment_id/);
  assert.match(migration, /update assignments set status='cancelled',cancelled_at=now\(\),is_initial=false,replaced_by_assignment_id=v_new_id/);
  assert.match(migration, /'assignment\.reassign'/);
  assert.match(adminData, /rpc\('reassign_task_assignment'/);
  assert.match(adminPage, /派发或重新分配任务/);
});
