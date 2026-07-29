import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isInvitationCode, normalizeInvitationCode } from '../lib/invitation-code.ts';

const migrationUrl = new URL('../supabase/migrations/202607290035_invitation_code_rotation.sql', import.meta.url);

test('invitation codes are normalized and validated centrally', () => {
  assert.equal(normalizeInvitationCode(' love-2026 '), 'LOVE-2026');
  for (const invalid of ['SHORT', '含中文邀请码', 'HAS SPACE', 'A'.repeat(33)]) {
    assert.equal(isInvitationCode(normalizeInvitationCode(invalid)), false);
  }
  assert.equal(isInvitationCode('LOVE-2026'), true);
});

test('rotation stores only a bcrypt hash and audits no plaintext code', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /invitation_code_hash=crypt\(v_code,gen_salt\('bf'\)\)/);
  assert.match(migration, /invitation_code_updated_at=now\(\)/);
  assert.match(migration, /'game_state\.invitation_code_rotate'/);
  assert.match(migration, /jsonb_build_object\('code_length',length\(v_code\)\)/);
  assert.equal(migration.includes("jsonb_build_object('code',"), false);
  assert.match(migration, /revoke all on function set_invitation_code\(text,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function set_invitation_code\(text,text\) to service_role/);
});

test('admin route validates rotation and mobile UI requires confirmation', async () => {
  const [route, data, page, preflight] = await Promise.all([
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/preflight.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /setInvitationCode\(requiredInvitationCode\(body\.code\), actor\)/);
  assert.match(data, /rpc\('set_invitation_code'/);
  assert.match(page, /两次输入的邀请码不一致/);
  assert.match(page, /系统只保存哈希/);
  assert.match(preflight, /item\('invitation-code'/);
});
