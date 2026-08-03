import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataUrl = new URL('../lib/data/guest.ts', import.meta.url);
const routeUrl = new URL('../app/api/player-directory/route.ts', import.meta.url);
const pageUrl = new URL('../app/guest/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/202608010007_limit_player_code_attempts_to_three.sql', import.meta.url);

test('authenticated guests can load only names, player codes, and private avatar paths on demand', async () => {
  const [data, route] = await Promise.all([readFile(dataUrl, 'utf8'), readFile(routeUrl, 'utf8')]);
  const directoryFunction = data.slice(data.indexOf('export async function getPlayerCodeDirectory'), data.indexOf('export async function submitGuestAssignment'));
  assert.match(route, /const guestId = await requireGuest\(\)/);
  assert.match(route, /noStoreJson\(\{ players: await getPlayerCodeDirectory\(guestId\) \}\)/);
  assert.match(directoryFunction, /select\('id,name,player_code,avatar_path'\)/);
  assert.match(directoryFunction, /signAvatarPaths\(data \?\? \[\]\)/);
  assert.match(directoryFunction, /avatarUrl: guest\.avatar_url/);
  assert.match(directoryFunction, /\.eq\('active', true\)/);
  assert.match(directoryFunction, /\.eq\('uses_app', true\)/);
  assert.match(directoryFunction, /\.not\('drawn_at', 'is', null\)/);
  assert.match(directoryFunction, /\.neq\('id', guestId\)/);
  assert.doesNotMatch(directoryFunction, /team|role|task|claim_code|login_name|avatar_uploaded_at/);
});

test('the guest directory presents a searchable avatar roster and explains privacy and attempt limits', async () => {
  const [page, styles] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(stylesUrl, 'utf8')]);
  assert.match(page, /fetch\('\/api\/player-directory', \{ cache: 'no-store' \}\)/);
  assert.match(page, /宾客验证列表/);
  assert.match(page, /这里只显示头像、姓名和编号/);
  assert.match(page, /player\.avatarUrl/);
  assert.match(page, /\.filter\(\(player\) => !term \|\|/);
  assert.match(page, /\.slice\(0, 40\)/);
  assert.match(page, /查看和复制不计次数/);
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
