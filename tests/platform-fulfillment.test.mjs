import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('fulfillment lanes are deterministic and keep human-only services out of standard automation', () => {
  const model = read('lib/platform/fulfillment.ts');
  const scope = read('app/platform/scope/delivery-scope-builder.tsx');
  const css = read('app/platform/platform.module.css');

  assert.match(model, /standard_auto/);
  assert.match(model, /custom_service/);
  assert.match(model, /customizationLevel !== 'template'/);
  assert.match(model, /supportMode !== 'self_service'/);
  assert.match(model, /rehearsalMode !== 'self_check'/);
  assert.match(model, /content-workshop/);
  assert.match(model, /wedding-day-support/);
  assert.match(model, /serviceNotes\.trim\(\)/);
  assert.match(scope, /标准版 · 自动交付/);
  assert.match(scope, /深度定制 · 人工服务/);
  assert.match(scope, /applyFulfillmentLane/);
  assert.match(scope, /styles\.scopeFormSection/);
  assert.match(scope, /styles\.fulfillmentOptionGrid/);
  assert.match(scope, /当前设置符合标准自动交付范围/);
  assert.match(css, /\.scopeShell\s*\{[^}]*width:100%;[^}]*max-width:none;[^}]*margin:0;[^}]*padding:0;/);
  assert.match(css, /\.scopeFormSection\s*\{/);
  assert.match(css, /\.scopeOption,.scopeOptionSelected\s*\{[^}]*display:block;[^}]*width:100%;/);
});

test('server-derived fulfillment plans are staff-only, idempotent, audited and payment-gated', () => {
  const migration = read('platform-control-plane/migrations/202608250022_fulfillment_plans.sql');
  const route = read('app/api/platform/operations/projects/[projectId]/fulfillment-plan/route.ts');
  const validation = read('lib/validation/platform-operations.ts');
  const data = read('lib/data/platform-operations.ts');
  const operations = read('app/platform/operations/platform-provisioning-queue.tsx');
  const customer = read('app/platform/projects/[projectId]/page.tsx');

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requirePlatformStaff\(\)/);
  assert.match(route, /readPlatformFulfillmentPlanInput/);
  assert.match(validation, /Object\.keys\(body\).*eventKey/s);
  assert.match(migration, /create table public\.platform_fulfillment_plans/);
  assert.match(migration, /platform_project_access_role\(project_id\) is not null/);
  assert.match(migration, /public\.platform_is_staff\(\)/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /platform_mutation_receipts/);
  assert.match(migration, /fulfillment_plan_created/);
  assert.match(migration, /creates_cloud_resources', false/);
  assert.match(migration, /activates_entitlement', false/);
  assert.match(migration, /platform_runtime_instances_require_fulfillment_plan/);
  assert.match(migration, /platform_fulfillment_plan_required/);
  assert.match(data, /platform_plan_project_fulfillment/);
  assert.match(data, /platform_fulfillment_plans/);
  assert.match(operations, /客户端不能自行选择自动交付/);
  assert.match(operations, /不会扣款、激活权益或创建任何云资源/);
  assert.match(customer, /任何自动开通都必须等待服务端付款验证/);
  assert.doesNotMatch(route + data + operations + migration, /stripe|checkout|payment_intent|api_key|service_role|fetch\(['"]https?:/i);
});
