import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290024_hidden_task_redemption_codes.sql', import.meta.url);

test('historical hidden task card codes were stored only as private fixed-length hashes', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /create table if not exists hidden_task_codes/);
  assert.match(migration, /code_hash text not null unique check \(code_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /alter table hidden_task_codes enable row level security/);
  assert.match(migration, /revoke all on table hidden_task_codes from public,anon,authenticated/);
  assert.doesNotMatch(migration, /code_value|raw_code|plain_code/);
});

test('historical code issuance was limited to an active hidden task and never audited the secret', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const issue = migration.slice(migration.indexOf('create or replace function issue_hidden_task_code'), migration.indexOf('create or replace function redeem_hidden_task_code'));
  assert.match(issue, /tasks where id=p_task_id and active and category='hidden'/);
  assert.match(issue, /hidden_task_code_already_claimed/);
  assert.match(issue, /from hidden_task_codes where task_id=p_task_id for update/);
  assert.match(issue, /if v_claimed_at is not null/);
  assert.match(issue, /'hidden_task_code\.issue'/);
  assert.doesNotMatch(issue, /jsonb_build_object\([^)]*code_hash/);
});

test('historical redemption locked the one-time card and delegated assignment invariants atomically', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const redeem = migration.slice(migration.indexOf('create or replace function redeem_hidden_task_code'), migration.indexOf('revoke all on table'));
  assert.match(redeem, /where code_hash=p_code_hash for update/);
  assert.match(redeem, /if v_code\.claimed_at is not null/);
  assert.match(redeem, /if v_guest\.drawn_at is null/);
  assert.match(redeem, /v_assignment_id:=assign_task_to_guest\(p_guest_id,v_code\.task_id,p_actor\)/);
  assert.match(redeem, /claimed_by=p_guest_id,[\s\S]*assignment_id=v_assignment_id/);
  assert.match(redeem, /'hidden_task_code\.redeem'/);
  assert.match(migration, /grant execute on function redeem_hidden_task_code\(uuid,text,text\) to service_role/);
});

test('legacy helper preserves high-entropy hashing for historical migration compatibility', async () => {
  const source = await readFile(new URL('../lib/hidden-task-code.ts', import.meta.url), 'utf8');
  assert.match(source, /CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'/);
  assert.match(source, /crypto\.randomInt\(CODE_ALPHABET\.length\)/);
  assert.match(source, /return `CUPID-\$\{compact\.slice\(0, 4\)\}-\$\{compact\.slice\(4\)\}`/);
  assert.match(source, /createHmac\('sha256', supabaseServiceRoleKey\)/);
  assert.match(source, /hidden-task-code-v1/);
});

test('current staff APIs expose no issue or redemption action', async () => {
  const route = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /const actor = await requireAdmin\(\)/);
  assert.doesNotMatch(route, /issueHiddenTaskCode|redeemHiddenTaskCode|隐藏任务码/);
});

test('current staff UI and dashboard data fully retire physical task cards', async () => {
  const [adminPage, stationPage, adminData, publicData, guestData] = await Promise.all([
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/station/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(adminPage, /隐藏任务实体卡|仅本次显示|issueHiddenTaskCode/);
  assert.doesNotMatch(stationPage, /兑换隐藏任务卡|redeemHiddenTaskCode|hiddenCode/);
  assert.equal(adminData.includes('hidden_task_codes'), false);
  assert.equal(publicData.includes('hidden_task_codes'), false);
  assert.equal(guestData.includes('hidden_task_codes'), false);
});
