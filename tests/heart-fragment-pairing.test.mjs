import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607310022_heart_fragment_pairing.sql', import.meta.url);
const guestPageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const guestDataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('heart halves are server authoritative and preserve existing live pairs', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /symbol in \('HEART','STAR'\) and fragment_side in \('LEFT','RIGHT'\)/);
  assert.match(migration, /r\.relationship_type='CUPID_ALLIANCE' and r\.status in \('PENDING','ACTIVE'\)/);
  assert.match(migration, /where symbol='HEART' and fragment_side is null/);
  assert.match(migration, /where symbol=new\.symbol/);
  assert.match(migration, /v_symbol='HEART' then 'heart_fragment_side_mismatch'/);
  assert.doesNotMatch(migration, /delete from|truncate table|drop table/);
});

test('heart matching shows the owners half and merges both halves after pairing', async () => {
  const [page, data, styles] = await Promise.all([
    readFile(guestPageUrl, 'utf8'),
    readFile(guestDataUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);
  assert.match(data, /heart_fragment_side_mismatch/);
  assert.match(page, /const symbolName = isStarTask \? '星星' : '爱心'/);
  assert.match(page, /左右两半\$\{symbolName\}已经合并/);
  assert.match(page, /两半\$\{isStarTask \? '星光' : '爱心'\}已经合二为一/);
  assert.match(page, /className="symbol-merge-half left"/);
  assert.match(page, /className="symbol-merge-half right"/);
  assert.match(styles, /\.symbol-fragment-stage\.heart/);
  assert.match(styles, /@keyframes symbol-half-left/);
  assert.match(styles, /@keyframes symbol-half-right/);
});
