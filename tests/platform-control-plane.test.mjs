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
  assert.match(proxy, /\/platform\/operations\/\:path\*/);
  assert.match(proxy, /\/platform\/invitations\/\:path\*/);
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
  const reviewRoute = read('app/api/platform/projects/[projectId]/submit-review/route.ts');
  const operatorReviewRoute = read('app/api/platform/operations/projects/[projectId]/review/route.ts');
  const data = read('lib/data/platform-projects.ts');
  const validation = read('lib/validation/platform-project.ts');

  assert.match(projectsRoute, /assertSameOrigin\(request\)/);
  assert.match(projectsRoute, /requirePlatformUser\(\)/);
  assert.match(projectsRoute, /readPlatformProjectSaveInput/);
  assert.match(authRoute, /assertSameOrigin\(request\)/);
  assert.match(authRoute, /requiredPlatformEmail/);
  assert.match(signOutRoute, /assertSameOrigin\(request\)/);
  assert.match(signOutRoute, /requirePlatformUser\(\)/);
  assert.match(reviewRoute, /assertSameOrigin\(request\)/);
  assert.match(reviewRoute, /requirePlatformUser\(\)/);
  assert.match(reviewRoute, /requiredUuid\(\(await params\)\.projectId/);
  assert.match(reviewRoute, /readPlatformReviewSubmissionInput/);
  assert.match(operatorReviewRoute, /assertSameOrigin\(request\)/);
  assert.match(operatorReviewRoute, /requirePlatformStaff\(\)/);
  assert.match(operatorReviewRoute, /requiredUuid\(\(await params\)\.projectId/);
  assert.match(operatorReviewRoute, /readPlatformOperatorReviewInput/);
  assert.match(data, /platform_save_customized_project_draft_v5/);
  assert.match(data, /platform_submit_project_for_review/);
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
  assert.match(sql, /platform_save_customized_project_draft_v2/);
  assert.match(sql, /platform_submit_project_for_review/);
  assert.match(sql, /project_submitted_for_review/);
  assert.match(sql, /platform_project_not_ready/);
  assert.match(sql, /create table public\.platform_staff/);
  assert.match(sql, /create table public\.platform_project_reviews/);
  assert.match(sql, /alter table public\.platform_staff enable row level security/);
  assert.match(sql, /alter table public\.platform_project_reviews enable row level security/);
  assert.match(sql, /platform_is_staff/);
  assert.match(sql, /platform_review_project/);
  assert.match(sql, /platform_staff_required/);
  assert.match(sql, /project_review_approved/);
  assert.match(sql, /project_review_changes_requested/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /create table public\.platform_project_members/);
  assert.match(sql, /create table public\.platform_project_invitations/);
  assert.match(sql, /platform_project_access_role/);
  assert.match(sql, /platform_save_customized_project_draft_v3/);
  assert.match(sql, /platform_save_customized_project_draft_v4/);
  assert.match(sql, /platform_save_customized_project_draft_v5/);
  assert.match(sql, /platform_create_project_invitation/);
  assert.match(sql, /platform_accept_project_invitation/);
  assert.match(sql, /platform_remove_project_member/);
  assert.match(sql, /octet_length\(token_hash\) = 32/);
  assert.match(sql, /decode\(p_token_hash, 'hex'\)/);
  assert.match(sql, /create table public\.platform_provisioning_manifests/);
  assert.match(sql, /platform_lock_provisioning_manifest/);
  assert.match(sql, /provisioning_manifest_locked/);
  assert.match(sql, /containsGuestRuntimeData/);
  assert.match(sql, /containsPrivateStoryNotes/);
  assert.match(sql, /extensions\.digest\(\$1, \$2\)/);
  assert.match(sql, /sha256\(\$1\)/);
  assert.match(sql, /create table public\.platform_runtime_instances/);
  assert.match(sql, /alter table public\.platform_runtime_instances enable row level security/);
  assert.match(sql, /platform_register_runtime_instance/);
  assert.match(sql, /runtime_instance_registered/);
  assert.match(sql, /platform_instance_entitlement_required/);
  assert.match(sql, /target_origin ~ '\^https:\/\//);
  assert.match(sql, /add column template_content jsonb/);
  assert.match(sql, /platform_template_content_is_valid/);
  assert.match(sql, /platform_project_versions_template_content/);
  assert.match(sql, /'templateContent', v_template_content/);
  assert.match(sql, /platform_template_content_v1_is_valid/);
  assert.match(sql, /jsonb_array_length\(p_value -> 'quickQuizQuestions'\) > 30/);
  assert.match(sql, /jsonb_array_length\(p_value -> 'charadesWords'\) > 80/);
  assert.match(sql, /platform_template_content_v2_is_valid/);
  assert.match(sql, /jsonb_array_length\(p_value -> 'missionCopyOverrides'\) > 10/);
  assert.match(sql, /count\(distinct value ->> 'missionCode'\)/);
  assert.match(sql, /add column delivery_scope jsonb/);
  assert.match(sql, /platform_delivery_scope_is_valid/);
  assert.match(sql, /platform_project_versions_delivery_scope/);
  assert.match(sql, /platform-save-v5:/);
  assert.match(sql, /platform_modules_are_valid/);
  assert.match(sql, /platform_projects_module_dependencies_check/);
  assert.match(sql, /platform_projects_enforce_module_dependencies/);
  assert.match(sql, /add column action text not null default 'draft_save'/);
  assert.match(sql, /content_brief/);
  assert.match(sql, /revoke execute on function public\.platform_save_project_draft[\s\S]*from authenticated/);
  assert.match(sql, /revoke all on function public\.platform_save_project_draft[\s\S]*from anon/);
  assert.match(sql, /grant execute on function public\.platform_save_project_draft[\s\S]*to authenticated/);
  assert.match(sql, /revoke execute on function public\.platform_save_customized_project_draft[\s\S]*from authenticated/);
  assert.match(sql, /grant execute on function public\.platform_save_customized_project_draft_v2[\s\S]*to authenticated/);
  assert.match(sql, /grant execute on function public\.platform_save_customized_project_draft_v3[\s\S]*to authenticated/);
  assert.doesNotMatch(weddingMigrations, /create table[^;]*platform_projects/i);
});

test('account UI does not transmit the device draft before explicit signed-in save', () => {
  const account = read('app/platform/account/platform-account-gateway.tsx');
  const projectWorkspace = read('app/platform/project/project-workspace.tsx');

  assert.match(account, /if \(!draft \|\| busy\) return/);
  assert.match(account, /disabled=\{!email \|\| busy \|\| projectsState !== 'ready'\}/);
  assert.match(account, /点击前不会传输本机草稿/);
  assert.match(account, /draftId: project\.sourceDraftId/);
  assert.match(account, /再次确认/);
  assert.match(account, /载入到本机编辑/);
  assert.match(account, /contentBrief: project\.contentBrief/);
  assert.match(account, /templateContent: project\.templateContent/);
  assert.match(projectWorkspace, /href="\/platform\/account"/);
  assert.doesNotMatch(account, /SERVICE_ROLE|service_role/);
});

test('cloud project workflow remains server-authenticated and project-member scoped', () => {
  const page = read('app/platform/projects/[projectId]/page.tsx');
  const reviewAction = read('app/platform/projects/[projectId]/project-review-action.tsx');
  const data = read('lib/data/platform-projects.ts');
  const account = read('app/platform/account/platform-account-gateway.tsx');

  assert.match(page, /getPlatformUser\(\)/);
  assert.match(page, /getPlatformProjectDetails\(user\.id, projectId\)/);
  assert.match(page, /仅项目成员可见/);
  assert.match(page, /尚未收费，也不会自动开通婚礼实例/);
  assert.match(data, /\.select\(PROJECT_FIELDS\)\.eq\('id', projectId\)\.maybeSingle\(\)/);
  assert.match(data, /platform_project_members/);
  assert.match(data, /accessRole/);
  assert.match(data, /platform_project_versions/);
  assert.match(data, /platform_entitlements/);
  assert.match(data, /platform_project_reviews/);
  assert.doesNotMatch(data, /select\(['"]\*['"]\)/);
  assert.match(account, /href=\{`\/platform\/projects\/\$\{project\.id\}`\}/);
  assert.match(page, /ProjectReviewAction/);
  assert.match(page, /不会收费、不会创建婚礼运行实例/);
  assert.match(reviewAction, /确认提交当前版本/);
  assert.match(reviewAction, /createPlatformDraftId\(\)/);
  assert.match(reviewAction, /router\.refresh\(\)/);
  assert.match(account, /版本已锁定/);
  assert.match(page, /平台已退回修改，项目重新开放编辑/);
  assert.match(page, /不会自动收费，也不会自动创建或修改云资源/);
});

test('project invitations are hashed, authenticated, revocable, and role-scoped', () => {
  const createRoute = read('app/api/platform/projects/[projectId]/invitations/route.ts');
  const acceptRoute = read('app/api/platform/invitations/accept/route.ts');
  const revokeRoute = read('app/api/platform/projects/[projectId]/invitations/[invitationId]/route.ts');
  const memberRoute = read('app/api/platform/projects/[projectId]/members/[memberUserId]/route.ts');
  const hashing = read('lib/platform/invitation.ts');
  const collaboration = read('app/platform/projects/[projectId]/project-collaboration.tsx');
  const invitationPage = read('app/platform/invitations/[token]/invitation-acceptance.tsx');
  const data = read('lib/data/platform-projects.ts');

  for (const route of [createRoute, acceptRoute, revokeRoute, memberRoute]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requirePlatformUser\(\)/);
  }
  assert.match(hashing, /createHash\('sha256'\)/);
  assert.doesNotMatch(hashing, /console\.|process\.env/);
  assert.match(createRoute, /hashPlatformInvitationToken\(input\.invitationToken\)/);
  assert.match(acceptRoute, /hashPlatformInvitationToken\(input\.invitationToken\)/);
  assert.match(collaboration, /生成七天邀请链接/);
  assert.match(collaboration, /数据库只保存链接令牌的 SHA-256 哈希/);
  assert.match(collaboration, /再次点击确认撤销/);
  assert.match(invitationPage, /next: `\/platform\/invitations\/\$\{token\}`/);
  assert.match(invitationPage, /不会授予婚礼现场后台/);
  assert.match(data, /platform_save_customized_project_draft_v5/);
  assert.match(data, /accessRole/);
});

test('operator review desk is staff-only, versioned, and cannot provision resources directly', () => {
  const page = read('app/platform/operations/page.tsx');
  const queue = read('app/platform/operations/platform-review-queue.tsx');
  const staff = read('lib/platform/staff.ts');
  const data = read('lib/data/platform-operations.ts');
  const validation = read('lib/validation/platform-operations.ts');

  assert.match(page, /requirePlatformStaff\(\)/);
  assert.match(page, /客户账号与平台工作人员权限完全分开/);
  assert.match(queue, /不会自动收费或创建云资源/);
  assert.match(queue, /退回修改前，请先填写/);
  assert.match(queue, /createPlatformDraftId\(\)/);
  assert.match(queue, /router\.refresh\(\)/);
  assert.match(staff, /\.from\('platform_staff'\)/);
  assert.match(staff, /\.eq\('user_id', user\.id\)/);
  assert.match(staff, /\.eq\('active', true\)/);
  assert.match(data, /\.eq\('status', 'content_review'\)/);
  assert.match(data, /platform_review_project/);
  assert.doesNotMatch(page + queue + staff + data, /SERVICE_ROLE|service_role/);
  assert.match(validation, /changes_requested/);
  assert.match(validation, /退回修改时必须填写明确的审核意见/);
});

test('provisioning manifests are staff-only, immutable, downloadable, and exclude private content', () => {
  const route = read('app/api/platform/operations/projects/[projectId]/manifest/route.ts');
  const queue = read('app/platform/operations/platform-provisioning-queue.tsx');
  const data = read('lib/data/platform-operations.ts');
  const migration = read('platform-control-plane/migrations/202608250006_provisioning_manifest.sql');

  assert.match(route, /requirePlatformStaff\(\)/g);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /readPlatformManifestLockInput/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /Content-Disposition/);
  assert.match(data, /\.eq\('status', 'provisioning'\)/);
  assert.match(data, /platform_lock_provisioning_manifest/);
  assert.match(queue, /不创建 Vercel、Supabase、域名或付费资源/);
  assert.match(queue, /故事原文、禁忌备注、主持备注、宾客数据或密钥/);
  assert.doesNotMatch(migration.match(/v_manifest\.manifest :=[\s\S]*?v_manifest\.manifest_hash :=/)?.[0] ?? '', /storyMoments|avoidTopics|hostNotes|story_note/);
  assert.doesNotMatch(route + queue + data, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
});

test('runtime instance registration is staff-only, entitlement-gated, idempotent, and stores no secrets', () => {
  const route = read('app/api/platform/operations/projects/[projectId]/instance/route.ts');
  const queue = read('app/platform/operations/platform-provisioning-queue.tsx');
  const data = read('lib/data/platform-operations.ts');
  const validation = read('lib/validation/platform-operations.ts');
  const migration = read('platform-control-plane/migrations/202608250007_runtime_instance_registry.sql');

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requirePlatformStaff\(\)/);
  assert.match(route, /readPlatformInstanceRegistrationInput/);
  assert.match(data, /platform_register_runtime_instance/);
  assert.match(data, /\.from\('platform_runtime_instances'\)\.select\('id,project_id,project_version,manifest_hash,target_origin,deployment_ref,status,registered_at'\)/);
  assert.match(validation, /parsed\.protocol !== 'https:'/);
  assert.match(validation, /parsed\.username/);
  assert.match(validation, /parsed\.pathname !== '\/'/);
  assert.match(validation, /parsed\.search/);
  assert.match(validation, /parsed\.hash/);
  assert.match(queue, /不要粘贴 Token、API Key、数据库连接串/);
  assert.match(queue, /不会保存密钥、创建资源或主动访问该网址/);
  assert.match(queue, /rel="noreferrer"/);
  assert.match(migration, /v_entitlement_status <> 'active'/);
  assert.match(migration, /v_manifest\.project_version <> v_project\.current_version/);
  assert.match(migration, /platform_instance_target_in_use/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /api_key|access_token|refresh_token|password|credential/i);
  assert.doesNotMatch(route + queue + data, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
});

test('template content pack is locally editable, strictly validated, versioned, and delivered as plain configuration', () => {
  const draft = read('lib/platform/draft.ts');
  const intake = read('app/platform/content/content-intake.tsx');
  const validation = read('lib/validation/platform-project.ts');
  const data = read('lib/data/platform-projects.ts');
  const review = read('app/platform/operations/platform-review-queue.tsx');
  const migration = read('platform-control-plane/migrations/202608250008_template_content_pack.sql');
  const missionCopy = read('lib/platform/mission-copy.ts');
  const missionCopyMigration = read('platform-control-plane/migrations/202608250012_mission_copy_overrides.sql');

  assert.match(draft, /PlatformTemplateContent/);
  assert.match(draft, /isPlatformMissionCopyOverride/);
  assert.match(draft, /description,missionCode,title/);
  assert.match(draft, /PLATFORM_TEMPLATE_VARIABLES/);
  assert.match(draft, /renderPlatformTemplateText/);
  assert.match(intake, /TEMPLATE CONTENT PACK/);
  assert.match(intake, /新人问答题库/);
  assert.match(intake, /组队快问快答题库/);
  assert.match(intake, /你比划我猜词库/);
  assert.match(intake, /定制安全开放的任务文案/);
  assert.match(intake, /积分、人数、分配方式、核验方法和系统结算保持锁定/);
  assert.match(intake, /最终会以纯文字替换，不执行 HTML、脚本或代码/);
  assert.match(intake, /实际口播预览/);
  assert.match(validation, /\[<>\]/);
  assert.match(validation, /包含不支持的变量/);
  assert.match(validation, /新人问答最多可以设置 20 题/);
  assert.match(validation, /快问快答最多可以设置 30 题/);
  assert.match(validation, /你比划我猜最多可以设置 80 个词/);
  assert.match(validation, /同一项任务只能设置一份自定义文案/);
  assert.match(validation, /description,missionCode,title/);
  assert.match(data, /platform_save_customized_project_draft_v5/);
  assert.match(data, /p_template_content: draft\.templateContent/);
  assert.match(review, /project\.templateContent\.openingScript/);
  assert.match(migration, /platform_template_content_is_valid/);
  assert.match(migration, /jsonb_array_length\(p_value -> 'quizQuestions'\) > 20/);
  assert.match(migration, /platform-save-v4:/);
  assert.match(migration, /coalesce\(public\.platform_project_access_role\(v_receipt_project_id\), ''\) not in \('owner', 'editor'\)/);
  assert.match(migration, /snapshot = version\.snapshot \|\| jsonb_build_object\('template_content'/);
  assert.match(migration, /'templateContent', v_template_content/);
  const teamBankMigration = read('platform-control-plane/migrations/202608250009_team_game_content_banks.sql');
  assert.match(teamBankMigration, /platform_template_content_v1_is_valid/);
  assert.match(teamBankMigration, /quickQuizQuestions/);
  assert.match(teamBankMigration, /charadesWords/);
  assert.match(missionCopy, /P1-SOCIAL-001/);
  assert.match(missionCopy, /P2-CEREMONY-001/);
  assert.doesNotMatch(missionCopy, /P1-HEART-001|P1-STAR-001|P2-TRICKSTER-001|P2-POWER-001|P2-LUCKY-001/);
  assert.match(missionCopyMigration, /platform_template_content_v2_is_valid/);
  assert.match(missionCopyMigration, /'missionCode', 'title', 'description'/);
  assert.match(missionCopyMigration, /jsonb_array_length\(p_value -> 'missionCopyOverrides'\) > 10/);
  assert.match(missionCopyMigration, /count\(distinct value ->> 'missionCode'\)/);
  assert.match(missionCopyMigration, /platform_project_versions/);
  assert.match(missionCopyMigration, /missionCopyOverrides/);
  assert.doesNotMatch(read('app/guest/page.tsx'), /templateContent|quickQuizQuestions|charadesWords|missionCopyOverrides/);
  assert.doesNotMatch(intake + validation + data, /dangerouslySetInnerHTML|eval\(|new Function/);
});

test('commercial delivery scope is closed-shape, versioned, reviewed, and never creates payment state', () => {
  const scope = read('app/platform/scope/delivery-scope-builder.tsx');
  const draft = read('lib/platform/draft.ts');
  const validation = read('lib/validation/platform-project.ts');
  const data = read('lib/data/platform-projects.ts');
  const account = read('app/platform/account/platform-account-gateway.tsx');
  const review = read('app/platform/operations/platform-review-queue.tsx');
  const migration = read('platform-control-plane/migrations/202608250010_delivery_scope.sql');

  assert.match(scope, /当前不是订单/);
  assert.match(draft, /DEFAULT_PLATFORM_DELIVERY_SCOPE/);
  assert.match(validation, /服务项目不能重复/);
  assert.match(validation, /服务范围备注.*1000/);
  assert.match(data, /platform_save_customized_project_draft_v5/);
  assert.match(data, /p_delivery_scope: draft\.deliveryScope/);
  assert.match(account, /deliveryScope: project\.deliveryScope/);
  assert.match(review, /商业与交付范围/);
  assert.match(migration, /platform_delivery_scope_is_valid/);
  assert.match(migration, /p_value - array\['customizationLevel', 'supportMode', 'rehearsalMode', 'services', 'serviceNotes'\]/);
  assert.match(migration, /snapshot = version\.snapshot \|\| jsonb_build_object\('delivery_scope'/);
  assert.match(migration, /coalesce\(public\.platform_project_access_role\(v_receipt_project_id\), ''\) not in \('owner', 'editor'\)/);
  assert.doesNotMatch(scope + data + migration, /stripe|checkout|payment_intent|createOrder/i);
});

test('project backup is owner-only, private, non-cacheable, and excludes collaboration and runtime records', () => {
  const route = read('app/api/platform/projects/[projectId]/export/route.ts');
  const data = read('lib/data/platform-projects.ts');
  const serializer = read('lib/platform/project-export.ts');
  const backup = read('lib/platform/project-backup.ts');
  const page = read('app/platform/projects/[projectId]/page.tsx');

  assert.match(route, /requirePlatformUser\(\)/);
  assert.match(route, /requiredUuid\(\(await params\)\.projectId/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /X-Content-Type-Options.*nosniff/);
  assert.match(data, /row\.owner_user_id !== ownerUserId/);
  assert.match(data, /只有项目所有者可以下载完整方案备份/);
  assert.match(serializer, /wedding-project-draft\/v1/);
  assert.match(serializer, /containsGuestRuntimeData: false/);
  assert.match(serializer, /containsCollaboratorAccounts: false/);
  assert.match(serializer, /constitutesFinalWeddingArchive: false/);
  assert.match(backup, /hasExactKeys/);
  assert.match(backup, /createPlatformDraftId\(\)/);
  assert.match(backup, /project\.template\.version !== FLAGSHIP_TEMPLATE\.version/);
  assert.match(backup, /containsCredentials !== false/);
  assert.match(backup, /isWeddingDraft\(candidate\)/);
  assert.doesNotMatch(serializer, /sourceDraftId|member|invitation|audit|entitlement|runtimeInstance|email/i);
  assert.match(page, /project\.accessRole === 'owner'/);
  assert.match(page, /不是婚礼结束后的正式归档包/);
  assert.doesNotMatch(route + serializer, /SERVICE_ROLE|service_role/);
});
