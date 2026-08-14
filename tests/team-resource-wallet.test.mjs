import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607290026_team_resource_wallet.sql', import.meta.url), 'utf8');
const hostData = await readFile(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
const hostRoute = await readFile(new URL('../app/api/host-action/route.ts', import.meta.url), 'utf8');
const hostPage = await readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const scoreboardCore = await readFile(new URL('../lib/scoreboard-core.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const adminExportRoute = await readFile(new URL('../app/api/admin-export/route.ts', import.meta.url), 'utf8');
const adminExportData = await readFile(new URL('../lib/data/export.ts', import.meta.url), 'utf8');

test('team resource wallets are private, start at ten, and cannot be overdrawn', () => {
  assert.match(migration, /balance integer not null default 10 check \(balance between 0 and 1000\)/);
  assert.match(migration, /alter table team_resources enable row level security/);
  assert.match(migration, /alter table team_resource_ledger enable row level security/);
  assert.match(migration, /revoke all on team_resources from public, anon, authenticated/);
  assert.match(migration, /if v_new_balance<0 then raise exception using errcode='P0001',message='insufficient_team_resources'/);
});

test('resource changes are atomic, audited, and retry-idempotent', () => {
  const rpc = migration.slice(migration.indexOf('create or replace function adjust_team_resources'));
  assert.match(rpc, /event_key uuid not null unique|p_event_key uuid/);
  assert.match(rpc, /select \* into v_wallet from team_resources where team=p_team for update/);
  assert.match(rpc, /if found then[\s\S]+return v_existing\.balance_after/);
  assert.match(rpc, /exception when unique_violation/);
  assert.match(rpc, /'team\.resources_adjust'/);
  assert.match(rpc, /jsonb_build_object\('amount',p_amount,'balance_after',v_new_balance,'reason',trim\(p_reason\)\)/);
});

test('resource mutations are no longer exposed by the minimal host route', () => {
  assert.match(hostRoute, /assertSameOrigin\(request\)/);
  assert.match(hostRoute, /requireAdmin\(\)/);
  assert.doesNotMatch(hostRoute, /adjustResources|金币变化/);
  assert.doesNotMatch(hostData, /adjustTeamResources|rpc\('adjust_team_resources'/);
});

test('resource wallets remain private and absent from host score data', () => {
  const scoreDto = hostData.slice(hostData.indexOf('export async function getHostDashboardData'), hostData.indexOf('export async function adjustHostTeamPoints'));
  assert.doesNotMatch(scoreDto, /team_resources|team_resource_ledger/);
  assert.doesNotMatch(publicData, /team_resources|team_resource_ledger/);
  assert.doesNotMatch(scoreboardCore, /team_resources|team_resource_ledger/);
});

test('retired resource wallets are absent from the admin UI and export API', () => {
  assert.doesNotMatch(adminPage, /竞拍金币|竞拍记录|team-resources|team\.resources_adjust/);
  assert.doesNotMatch(adminExportRoute, /team-resources/);
  assert.doesNotMatch(adminExportData, /team_resource_ledger|team-resources/);
});

test('mobile host score controls create one event key per submission', () => {
  assert.doesNotMatch(hostPage, /资源竞拍钱包/);
  assert.match(hostPage, /createEventKey\(\)/);
  assert.match(hostPage, /pendingScoreRef\.current\?\.signature === signature/);
  assert.match(hostPage, /JSON\.stringify\(\{ \.\.\.body, eventKey: pending\.eventKey, rehearsalRunId: data\?\.game\?\.rehearsal_run_id \}\)/);
  assert.match(hostPage, /团队计分/);
  assert.match(hostPage, /个人加分/);
});
