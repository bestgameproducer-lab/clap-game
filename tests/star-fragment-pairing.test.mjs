import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607310009_star_fragment_pairing.sql', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const guestDataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('star halves are server authoritative and existing live pairs stay complementary', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /add column if not exists fragment_side text/);
  assert.match(migration, /r\.status in \('PENDING','ACTIVE'\)/);
  assert.match(migration, /when s\.guest_id=r\.player_a_id then 'LEFT' else 'RIGHT'/);
  assert.match(migration, /create trigger symbol_pairing_assign_fragment_side/);
  assert.match(migration, /v_guest_fragment=v_target_fragment/);
  assert.match(migration, /star_fragment_side_mismatch/);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/);
});

test('star matching controls live inside the expanded mission and expose only the owners half', async () => {
  const [page, data, styles] = await Promise.all([
    readFile(guestPageUrl, 'utf8'),
    readFile(guestDataUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);
  assert.match(data, /select\('symbol,status,fragment_side,/);
  assert.match(data, /fragmentSide: symbolPairing\.fragment_side/);
  assert.match(page, /renderSymbolPairing\(assignment\)/);
  assert.match(page, /你的星星碎片/);
  assert.match(page, /邀请另一半星星/);
  assert.doesNotMatch(page, /<h2>星星配对<\/h2>/);
  assert.match(styles, /@keyframes star-half-left/);
  assert.match(styles, /@keyframes star-half-right/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
