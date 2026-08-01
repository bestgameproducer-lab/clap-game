import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const routeUrl = new URL('../app/api/player-directory/route.ts', import.meta.url);
const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/202608010007_limit_player_code_attempts_to_three.sql', import.meta.url);

test('authenticated guests can look up only names and player codes on demand', async () => {
  const [data, route] = await Promise.all([readFile(dataUrl, 'utf8'), readFile(routeUrl, 'utf8')]);
  const directoryFunction = data.slice(data.indexOf('export async function getPlayerCodeDirectory'), data.indexOf('export async function submitGuestAssignment'));
  assert.match(route, /const guestId = await requireGuest\(\)/);
  assert.match(route, /noStoreJson\(\{ players: await getPlayerCodeDirectory\(guestId\) \}\)/);
  assert.match(directoryFunction, /select\('id,name,player_code'\)/);
  assert.match(directoryFunction, /\.eq\('active', true\)/);
  assert.match(directoryFunction, /\.eq\('uses_app', true\)/);
  assert.match(directoryFunction, /\.not\('drawn_at', 'is', null\)/);
  assert.match(directoryFunction, /\.neq\('id', guestId\)/);
  assert.doesNotMatch(directoryFunction, /team|role|task|claim_code|login_name/);
});

test('the guest directory is name-search-first and explains privacy and attempt limits', async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(stylesUrl, 'utf8')]);
  assert.match(page, /fetch\('\/api\/player-directory', \{ cache: 'no-store' \}\)/);
  assert.match(page, /查询他人/);
  assert.match(page, /这里只显示姓名和编号，不会公开分组、身份或任务/);
  assert.match(page, /if \(!term \|\| !playerDirectory\) return \[\]/);
  assert.match(page, /\.slice\(0, 8\)/);
  assert.match(page, /查询和复制不计入次数/);
  assert.match(styles, /\.player-directory-dialog/);
  assert.match(styles, /\.hero-code-actions/);
});

test('a forward-only migration limits code submissions to three per ten minutes', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /create or replace function consume_player_code_attempt\(p_guest_id uuid\)/);
  assert.match(migration, /if v_count>3 then/);
  assert.match(migration, /locked_until=v_now\+interval '10 minutes'/);
  assert.match(migration, /grant execute on function consume_player_code_attempt\(uuid\) to service_role/);
  assert.match(migration, /'attempt_limit',3,'window_minutes',10/);
  assert.doesNotMatch(migration, /update guests set player_code|delete from guests|truncate/);
});
