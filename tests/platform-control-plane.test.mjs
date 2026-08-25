import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('platform control plane uses separate environment variables and never imports wedding credentials', () => {
  const env = read('lib/platform/env.ts');
  const serverClient = read('lib/platform/supabase-server.ts');
  const example = read('.env.example');

  assert.match(env, /PLATFORM_SUPABASE_URL/);
  assert.match(env, /PLATFORM_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(env + serverClient, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(example, /separate Supabase project/);
});

test('platform SSR authentication verifies claims and refreshes only platform control routes', () => {
  const auth = read('lib/platform/auth.ts');
  const proxy = read('proxy.ts');
  const proxyCore = read('lib/platform/proxy.ts');
  const callback = read('app/platform/auth/confirm/route.ts');

  assert.match(auth, /auth\.getClaims\(\)/);
  assert.doesNotMatch(auth, /getSession\(\)/);
  assert.match(proxy, /\/platform\/account\/\:path\*/);
  assert.match(proxy, /\/api\/platform\/\:path\*/);
  assert.doesNotMatch(proxy, /\/guest|\/admin|\/host|\/station/);
  assert.match(proxyCore, /Cache-Control.*private.*no-store/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /verifyOtp/);
  assert.match(callback, /safePlatformReturnPath/);
});

test('every platform mutation is same-origin, authenticated, validated, and isolated in the data layer', () => {
  const projectsRoute = read('app/api/platform/projects/route.ts');
  const authRoute = read('app/api/platform/auth/request-link/route.ts');
  const signOutRoute = read('app/api/platform/auth/sign-out/route.ts');
  const data = read('lib/data/platform-projects.ts');
  const validation = read('lib/validation/platform-project.ts');

  assert.match(projectsRoute, /assertSameOrigin\(request\)/);
  assert.match(projectsRoute, /requirePlatformUser\(\)/);
  assert.match(projectsRoute, /readPlatformProjectSaveInput/);
  assert.match(authRoute, /assertSameOrigin\(request\)/);
  assert.match(authRoute, /requiredPlatformEmail/);
  assert.match(signOutRoute, /assertSameOrigin\(request\)/);
  assert.match(signOutRoute, /requirePlatformUser\(\)/);
  assert.match(data, /platform_save_customized_project_draft/);
  assert.doesNotMatch(data, /select\(['"]\*['"]\)/);
  assert.match(validation, /requiredUuid\(body\.eventKey/);
  assert.match(validation, /游戏模块不能重复/);
});

test('control-plane migrations own projects, content briefs, versions, entitlements, audit, RLS and idempotency', () => {
  const sql = fs.readdirSync(path.join(rootDir, 'platform-control-plane/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => read(`platform-control-plane/migrations/${name}`))
    .join('\n');
  const weddingMigrations = fs.readdirSync(path.join(rootDir, 'supabase/migrations'))
    .filter((name) => name.endsWith('.sql'))
    .map((name) => read(`supabase/migrations/${name}`))
    .join('\n');

  for (const table of [
    'platform_projects',
    'platform_project_versions',
    'platform_entitlements',
    'platform_audit_log',
    'platform_mutation_receipts',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = public, auth, pg_temp/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /project_draft_saved/);
  assert.match(sql, /platform_save_customized_project_draft/);
  assert.match(sql, /content_brief/);
  assert.match(sql, /revoke execute on function public\.platform_save_project_draft[\s\S]*from authenticated/);
  assert.match(sql, /revoke all on function public\.platform_save_project_draft[\s\S]*from anon/);
  assert.match(sql, /grant execute on function public\.platform_save_project_draft[\s\S]*to authenticated/);
  assert.doesNotMatch(weddingMigrations, /create table[^;]*platform_projects/i);
});

test('account UI does not transmit the device draft before explicit signed-in save', () => {
  const account = read('app/platform/account/platform-account-gateway.tsx');
  const projectWorkspace = read('app/platform/project/project-workspace.tsx');

  assert.match(account, /if \(!draft \|\| busy\) return/);
  assert.match(account, /disabled=\{!email \|\| busy\}/);
  assert.match(account, /点击前不会传输本机草稿/);
  assert.match(account, /draftId: project\.sourceDraftId/);
  assert.match(account, /再次确认/);
  assert.match(account, /载入到本机编辑/);
  assert.match(account, /contentBrief: project\.contentBrief/);
  assert.match(projectWorkspace, /href="\/platform\/account"/);
  assert.doesNotMatch(account, /SERVICE_ROLE|service_role/);
});

test('cloud project detail remains server-authenticated, owner-scoped and read-only', () => {
  const page = read('app/platform/projects/[projectId]/page.tsx');
  const data = read('lib/data/platform-projects.ts');
  const account = read('app/platform/account/platform-account-gateway.tsx');

  assert.match(page, /getPlatformUser\(\)/);
  assert.match(page, /getPlatformProjectDetails\(user\.id, projectId\)/);
  assert.match(page, /仅账号本人可见/);
  assert.match(page, /尚未收费，也不会自动开通婚礼实例/);
  assert.match(data, /\.eq\('owner_user_id', ownerUserId\)\.eq\('id', projectId\)/);
  assert.match(data, /platform_project_versions/);
  assert.match(data, /platform_entitlements/);
  assert.doesNotMatch(data, /select\(['"]\*['"]\)/);
  assert.match(account, /href=\{`\/platform\/projects\/\$\{project\.id\}`\}/);
});
