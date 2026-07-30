import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290036_guest_phase_notice.sql', import.meta.url);

test('guest phase notice is bounded, audited, and never trusts the client actor', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /length\(v_note\)>500/);
  assert.match(migration, /phase_note=nullif\(v_note,''\)/);
  assert.match(migration, /'game_state\.phase_note'/);
  assert.match(migration, /jsonb_build_object\('cleared',v_note='','note_length',length\(v_note\)\)/);
  assert.match(migration, /revoke all on function set_guest_phase_note\(text,text\) from public,anon,authenticated/);
});

test('admin route validates and publishes the guest-only notice', async () => {
  const [route, data, page, guestData, publicData] = await Promise.all([
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(route, /setGuestPhaseNote\(optionalString\(body\.note, '宾客端环节提示', 500\), actor\)/);
  assert.match(data, /rpc\('set_guest_phase_note'/);
  assert.match(page, /宾客手机上的当前提示/);
  assert.match(page, /type: 'setGuestPhaseNote', note: ''/);
  assert.match(guestData, /select\('registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,task_catalog_mode,[^']+'\)/);
  assert.equal(publicData.includes("select('phase_note"), false);
});
