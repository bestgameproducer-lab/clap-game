import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('commercial platform routes are isolated from the live wedding entry', () => {
  const platformPage = read('app/platform/page.tsx');
  const builderPage = read('app/platform/create/page.tsx');
  const weddingEntry = read('app/page.tsx');

  assert.match(platformPage, /FLAGSHIP_TEMPLATE\.name/);
  assert.match(platformPage, /href="\/platform\/templates\/cupid-wedding-trial/);
  assert.match(builderPage, /WeddingBuilder/);
  assert.doesNotMatch(weddingEntry, /href=["']\/platform/);
});

test('flagship template explains the full customer journey and links into customization', () => {
  const templatePage = read('app/platform/templates/cupid-wedding-trial/page.tsx');

  assert.match(templatePage, /签到抽卡/);
  assert.match(templatePage, /秘密相遇/);
  assert.match(templatePage, /晚宴组队/);
  assert.match(templatePage, /投票与揭晓/);
  assert.match(templatePage, /href="\/platform\/create"/);
});

test('platform catalog includes both commercial models and the full flagship module set', () => {
  const catalog = read('lib/platform/catalog.ts');

  assert.match(catalog, /id: 'buyout'/);
  assert.match(catalog, /id: 'subscription'/);
  for (const moduleId of [
    'secret-missions',
    'team-games',
    'host-toolkit',
    'live-scoreboard',
    'finale-vote',
  ]) {
    assert.match(catalog, new RegExp(`id: '${moduleId}'`));
  }
  assert.match(catalog, /PLATFORM_MODULE_REQUIREMENTS/);
  assert.match(catalog, /normalizePlatformModuleSelection/);
  assert.match(catalog, /removePlatformModuleWithDependents/);
});

test('first-phase builder keeps drafts local and does not access production services', () => {
  const builder = read('app/platform/create/wedding-builder.tsx');
  const draftLibrary = read('lib/platform/draft.ts');

  assert.match(builder, /window\.localStorage\.setItem/);
  assert.match(draftLibrary, /isWeddingDraft/);
  assert.match(builder, /不会自动上传/);
  assert.match(builder, /URL\.createObjectURL/);
  assert.match(builder, /需求单/);
  assert.match(builder, /导入方案备份/);
  assert.match(builder, /PLATFORM_PROJECT_BACKUP_MAX_BYTES/);
  assert.match(builder, /恢复为新的本机副本/);
  assert.doesNotMatch(builder, /fetch\s*\(/);
  assert.doesNotMatch(builder, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('content intake captures customization and privacy boundaries in the same device draft', () => {
  const page = read('app/platform/content/page.tsx');
  const intake = read('app/platform/content/content-intake.tsx');
  const draft = read('lib/platform/draft.ts');

  assert.match(page, /ContentIntake/);
  assert.match(intake, /LANGUAGE_OPTIONS/);
  assert.match(intake, /INTERACTION_OPTIONS/);
  assert.match(intake, /GUEST_MIX_OPTIONS/);
  assert.match(intake, /boundariesConfirmed/);
  assert.match(intake, /只有你在账号页明确点击保存/);
  assert.match(intake, /定制安全开放的任务文案/);
  assert.match(intake, /任务编号、阶段、积分、人数、分配方式、核验方法和系统结算保持锁定/);
  assert.match(intake, /爱心\/星星抉择、恶作剧者、能力卡等机制任务不可在这里修改/);
  assert.match(draft, /PlatformContentBrief/);
  assert.match(draft, /PlatformMissionCopyOverride/);
  assert.match(draft, /内容边界尚未确认/);
});

test('local project workspace reads the same validated draft without creating cloud state', () => {
  const workspace = read('app/platform/project/project-workspace.tsx');
  const projectPage = read('app/platform/project/page.tsx');

  assert.match(projectPage, /ProjectWorkspace/);
  assert.match(workspace, /PLATFORM_DRAFT_STORAGE_KEY/);
  assert.match(workspace, /isWeddingDraft/);
  assert.match(workspace, /项目交付阶段/);
  assert.match(workspace, /首期资料清单/);
  assert.doesNotMatch(workspace, /localStorage\.setItem/);
  assert.doesNotMatch(workspace, /fetch\s*\(/);
});

test('experience preview renders guest, host, and scoreboard mockups from local draft only', () => {
  const page = read('app/platform/preview/page.tsx');
  const preview = read('app/platform/preview/template-experience-preview.tsx');

  assert.match(page, /TemplateExperiencePreview/);
  assert.match(preview, /PLATFORM_DRAFT_STORAGE_KEY/);
  assert.match(preview, /ensureWeddingDraftId/);
  assert.match(preview, /宾客入口/);
  assert.match(preview, /主持人题库/);
  assert.match(preview, /积分大屏/);
  assert.match(preview, /秘密任务文案/);
  assert.match(preview, /规则与积分锁定/);
  assert.match(preview, /答案只在主持端显示/);
  assert.match(preview, /这不是正式婚礼实例/);
  assert.match(preview, /disabled>领取我的秘密身份/);
  assert.doesNotMatch(preview, /fetch\s*\(|\/api\/guest|\/api\/host|\/api\/public-scoreboard/);
});

test('commercial delivery scope stays local until explicit account save and contains no guessed pricing', () => {
  const page = read('app/platform/scope/page.tsx');
  const builder = read('app/platform/scope/delivery-scope-builder.tsx');
  const catalog = read('lib/platform/catalog.ts');
  const draft = read('lib/platform/draft.ts');

  assert.match(page, /DeliveryScopeBuilder/);
  assert.match(builder, /PLATFORM_DRAFT_STORAGE_KEY/);
  assert.match(builder, /交付模式/);
  assert.match(builder, /定制深度/);
  assert.match(builder, /运营协作方式/);
  assert.match(builder, /彩排方式/);
  assert.match(builder, /当前不是订单/);
  assert.match(builder, /不显示未经确认的价格/);
  assert.match(catalog, /wedding-day-support/);
  assert.match(catalog, /needs-confirmation/);
  assert.match(draft, /PlatformDeliveryScope/);
  assert.doesNotMatch(builder, /fetch\s*\(|checkout|stripe|paymentIntent/i);
});

test('guest capacity preflight is local-only and separate from production roster import', () => {
  const page = read('app/platform/capacity/page.tsx');
  const planner = read('app/platform/capacity/capacity-planner.tsx');
  const capacity = read('lib/platform/capacity.ts');

  assert.match(page, /CapacityPlanner/);
  assert.match(planner, /SEATS BEFORE NAMES/);
  assert.match(planner, /不收集宾客姓名/);
  assert.match(planner, /下载空白席位 CSV/);
  assert.match(capacity, /FLAGSHIP_PARTICIPATION_CONTRACT/);
  assert.match(capacity, /buildPlatformSeatTemplateCsv/);
  assert.doesNotMatch(planner, /fetch\s*\(|\/api\//);
});

test('platform preview stays non-indexed until accounts, billing and cloud persistence are ready', () => {
  const layout = read('app/platform/layout.tsx');
  const architecture = read('docs/platform-product-architecture.md');

  assert.match(layout, /index: false/);
  assert.match(layout, /follow: false/);
  assert.match(architecture, /当前产品预览不展示未经确认的价格/);
  assert.match(architecture, /运行数据隔离/);
});

test('platform customizer has responsive mobile layout rules', () => {
  const styles = read('app/platform/platform.module.css');

  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.builderWorkspace/);
  assert.match(styles, /\.builderPreview/);
});
