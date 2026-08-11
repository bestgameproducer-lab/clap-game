import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608110001_add_joint_family_guest_account.sql', import.meta.url);

test('joint family account keeps two physical guests behind one login', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /陈天然 & 陈子宥 Tianran Chen & Ziyou Chen/);
  assert.match(migration, /Tianran Chen & Ziyou Chen/);
  assert.match(migration, /team='家人组'/);
  assert.match(migration, /phase_two_eligible=false/);
  assert.match(migration, /eligible_for_secret_role=false/);
  assert.match(migration, /physical_guests',2/);
  assert.match(migration, /login_accounts',1/);
});

test('joint account receives exactly one dedicated photo mission', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'P1-FAMILY-001','STANDARD','STANDARD','CONTROLLED_RANDOM','PHOTO',1/);
  assert.match(migration, /lower\(v_guest\.login_name\)='tianran chen & ziyou chen'/);
  assert.match(migration, /mission_code='P1-FAMILY-001'/);
  assert.match(migration, /joint_family_account_runtime_conflict/);
  assert.match(migration, /joint_family_account_already_started/);
});
