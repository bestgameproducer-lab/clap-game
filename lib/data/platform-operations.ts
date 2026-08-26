import 'server-only';
import { ApiError } from '../errors';
import {
  DEFAULT_PLATFORM_CONTENT_BRIEF,
  DEFAULT_PLATFORM_DELIVERY_SCOPE,
  isPlatformContentBrief,
  isPlatformDeliveryScope,
  normalizePlatformTemplateContent,
  type PlatformContentBrief,
  type PlatformDeliveryScope,
  type PlatformTemplateContent,
} from '../platform/draft';
import {
  normalizePlatformDataPolicy,
  type PlatformDataPolicy,
} from '../platform/data-policy';
import { createPlatformServerClient } from '../platform/supabase-server';
import type { PlatformReviewDecision } from '../validation/platform-operations';
import type { PlatformRuntimeAttestationStage, PlatformRuntimeChecklist } from '../platform/runtime-readiness';
import type { PlatformRuntimeReleaseAction, PlatformRuntimeReleaseChecklist } from '../platform/runtime-release';
import type { PlatformCommercialQuote, PlatformQuoteBillingInterval, PlatformQuoteCurrency } from '../platform/commercial';
import type { PlatformFulfillmentPlan } from '../platform/fulfillment';

export type PlatformRuntimeAttestationDto = {
  id: string;
  stage: PlatformRuntimeAttestationStage;
  note: string;
  createdAt: string;
};

export type PlatformRuntimeReleaseEventDto = {
  id: string;
  action: PlatformRuntimeReleaseAction;
  projectVersion: number;
  manifestHash: string;
  targetOrigin: string;
  deploymentRef: string;
  note: string;
  customerMessage: string;
  createdAt: string;
};

export type PlatformCommercialQuoteQueueItem = {
  id: string;
  projectId: string;
  projectVersion: number;
  planId: 'buyout' | 'subscription';
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  guestCount: number;
  deliveryScope: PlatformDeliveryScope;
  requestedAt: string;
  quote: PlatformCommercialQuote | null;
  proceedRequestedAt: string | null;
};

export type PlatformReviewQueueItem = {
  id: string;
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  guestCount: number;
  planId: 'buyout' | 'subscription';
  modules: string[];
  contentBrief: PlatformContentBrief;
  templateContent: PlatformTemplateContent;
  deliveryScope: PlatformDeliveryScope;
  dataPolicy: PlatformDataPolicy;
  version: number;
  submittedAt: string;
};

export type PlatformProvisioningManifest = {
  schemaVersion: 'wedding-instance-config/v1' | 'wedding-instance-config/v2';
  source: { projectId: string; projectVersion: number; templateId: string; templateVersion: string };
  wedding: { displayName: string; partnerOne: string; partnerTwo: string; date: string; location: string; guestCapacity: number };
  experience: { theme: string; tone: string; modules: string[]; language: string; interaction: string; guestMix: string; templateContent: PlatformTemplateContent };
  delivery: { plan: 'buyout' | 'subscription'; dataPolicy?: PlatformDataPolicy };
  safeguards: { containsGuestRuntimeData: false; containsCredentials: false; containsPrivateStoryNotes: false };
};

export type PlatformProvisioningQueueItem = {
  id: string;
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  planId: 'buyout' | 'subscription';
  version: number;
  updatedAt: string;
  projectStatus: 'provisioning' | 'ready' | 'live';
  entitlementStatus: 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired';
  deliveryScope: PlatformDeliveryScope;
  manifest: null | { projectVersion: number; hash: string; createdAt: string };
  fulfillmentPlan: PlatformFulfillmentPlan | null;
  releaseEvents: PlatformRuntimeReleaseEventDto[];
  instance: null | {
    id: string;
    projectVersion: number;
    manifestHash: string;
    targetOrigin: string;
    deploymentRef: string;
    status: 'registered' | 'verified' | 'ready' | 'suspended' | 'archived';
    registeredAt: string;
    verifiedAt: string | null;
    readyAt: string | null;
    attestations: PlatformRuntimeAttestationDto[];
  };
};

type ReviewQueueRow = {
  id: string;
  partner_one: string;
  partner_two: string;
  wedding_date: string | null;
  location: string;
  guest_count: number;
  plan_id: PlatformReviewQueueItem['planId'];
  modules: string[];
  content_brief: unknown;
  template_content: unknown;
  delivery_scope: unknown;
  data_policy: unknown;
  current_version: number;
  updated_at: string;
};

type ProvisioningProjectRow = Pick<ReviewQueueRow, 'id' | 'partner_one' | 'partner_two' | 'wedding_date' | 'location' | 'plan_id' | 'current_version' | 'updated_at'> & {
  status: PlatformProvisioningQueueItem['projectStatus'];
  delivery_scope: unknown;
};

type ProvisioningEntitlementRow = { project_id: string; status: PlatformProvisioningQueueItem['entitlementStatus'] };
type ProvisioningManifestRow = { project_id: string; project_version: number; manifest_hash: string; created_at: string; manifest?: unknown };
type FulfillmentPlanRow = {
  project_id: string;
  project_version: number;
  lane: PlatformFulfillmentPlan['lane'];
  status: PlatformFulfillmentPlan['status'];
  runtime_model: PlatformFulfillmentPlan['runtimeModel'];
  created_at: string;
};
type RuntimeInstanceRow = {
  id: string;
  project_id: string;
  project_version: number;
  manifest_hash: string;
  target_origin: string;
  deployment_ref: string;
  status: NonNullable<PlatformProvisioningQueueItem['instance']>['status'];
  registered_at: string;
  verified_at: string | null;
  ready_at: string | null;
};

type RuntimeAttestationRow = {
  id: string;
  instance_id: string;
  stage: PlatformRuntimeAttestationStage;
  note: string;
  created_at: string;
};

type RuntimeReleaseEventRow = {
  id: string;
  project_id: string;
  action: PlatformRuntimeReleaseAction;
  project_version: number;
  manifest_hash: string;
  target_origin: string;
  deployment_ref: string;
  note: string;
  created_at: string;
};

type CustomerDeliveryEventRow = {
  release_event_id: string;
  customer_message: string;
};

type CommercialQuoteRequestRow = {
  id: string;
  project_id: string;
  project_version: number;
  plan_id: PlatformCommercialQuoteQueueItem['planId'];
  commercial_snapshot: {
    weddingDate?: string | null;
    location?: string;
    guestCount?: number;
    deliveryScope?: unknown;
  };
  requested_at: string;
};

type CommercialQuoteProjectRow = {
  id: string;
  partner_one: string;
  partner_two: string;
};

type CommercialQuoteRow = {
  id: string;
  quote_request_id: string;
  project_version: number;
  plan_id: PlatformCommercialQuote['planId'];
  amount_minor: number | string;
  currency: PlatformQuoteCurrency;
  billing_interval: PlatformQuoteBillingInterval;
  valid_until: string;
  service_summary: string;
  terms_summary: string;
  status: PlatformCommercialQuote['status'];
  offered_at: string;
};

type QuoteProceedRequestRow = {
  quote_id: string;
  requested_at: string;
};

function toCommercialQuote(row: CommercialQuoteRow): PlatformCommercialQuote {
  return {
    id: row.id,
    quoteRequestId: row.quote_request_id,
    projectVersion: row.project_version,
    planId: row.plan_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    billingInterval: row.billing_interval,
    validUntil: row.valid_until,
    serviceSummary: row.service_summary,
    termsSummary: row.terms_summary,
    status: row.status,
    offeredAt: row.offered_at,
  };
}

export async function listPlatformCommercialQuoteQueue(staffUserId: string): Promise<PlatformCommercialQuoteQueueItem[]> {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const requestsResult = await client
    .from('platform_commercial_quote_requests')
    .select('id,project_id,project_version,plan_id,commercial_snapshot,requested_at')
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })
    .limit(100);
  if (requestsResult.error) throw new Error(`Unable to read commercial quote requests: ${requestsResult.error.message}`);
  const requests = (requestsResult.data ?? []) as CommercialQuoteRequestRow[];
  if (!requests.length) return [];
  const [projectsResult, quotesResult] = await Promise.all([
    client.from('platform_projects').select('id,partner_one,partner_two').in('id', requests.map((request) => request.project_id)),
    client.from('platform_commercial_quotes').select('id,quote_request_id,project_version,plan_id,amount_minor,currency,billing_interval,valid_until,service_summary,terms_summary,status,offered_at').in('quote_request_id', requests.map((request) => request.id)).eq('status', 'offered'),
  ]);
  if (projectsResult.error) throw new Error(`Unable to read commercial quote projects: ${projectsResult.error.message}`);
  if (quotesResult.error) throw new Error(`Unable to read commercial quote drafts: ${quotesResult.error.message}`);
  const projects = new Map(((projectsResult.data ?? []) as CommercialQuoteProjectRow[]).map((project) => [project.id, project]));
  const quoteRows = (quotesResult.data ?? []) as CommercialQuoteRow[];
  const quotes = new Map(quoteRows.map((quote) => [quote.quote_request_id, toCommercialQuote(quote)]));
  const proceedResult = await client
    .from('platform_quote_proceed_requests')
    .select('quote_id,requested_at')
    .in('project_id', requests.map((request) => request.project_id))
    .eq('status', 'requested');
  if (proceedResult.error) throw new Error(`Unable to read quote proceed requests: ${proceedResult.error.message}`);
  const proceedRequests = new Map(((proceedResult.data ?? []) as QuoteProceedRequestRow[]).map((proceed) => [proceed.quote_id, proceed.requested_at]));
  return requests.map((request) => {
    const project = projects.get(request.project_id);
    const snapshot = request.commercial_snapshot;
    const deliveryScope = isPlatformDeliveryScope(snapshot.deliveryScope)
      ? snapshot.deliveryScope
      : DEFAULT_PLATFORM_DELIVERY_SCOPE;
    const quote = quotes.get(request.id) ?? null;
    return {
      id: request.id,
      projectId: request.project_id,
      projectVersion: request.project_version,
      planId: request.plan_id,
      partnerOne: project?.partner_one ?? '',
      partnerTwo: project?.partner_two ?? '',
      weddingDate: typeof snapshot.weddingDate === 'string' ? snapshot.weddingDate : '',
      location: typeof snapshot.location === 'string' ? snapshot.location : '',
      guestCount: typeof snapshot.guestCount === 'number' ? snapshot.guestCount : 0,
      deliveryScope,
      requestedAt: request.requested_at,
      quote,
      proceedRequestedAt: quote ? proceedRequests.get(quote.id) ?? null : null,
    };
  });
}

export async function offerPlatformCommercialQuote(
  staffUserId: string,
  input: {
    eventKey: string;
    quoteRequestId: string;
    amountMinor: number;
    currency: PlatformQuoteCurrency;
    billingInterval: PlatformQuoteBillingInterval;
    validUntil: string;
    serviceSummary: string;
    termsSummary: string;
  },
) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_offer_commercial_quote', {
    p_event_key: input.eventKey,
    p_quote_request_id: input.quoteRequestId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_billing_interval: input.billingInterval,
    p_valid_until: input.validUntil,
    p_service_summary: input.serviceSummary,
    p_terms_summary: input.termsSummary,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_quote_request_not_found')) throw new ApiError(404, '没有找到这条询价');
    if (error.message.includes('platform_quote_request_stale')) throw new ApiError(409, '客户的商业范围已经变化，请让客户重新提交询价');
    if (error.message.includes('platform_commercial_quote_invalid')) throw new ApiError(400, '报价金额、有效期、计费周期或文字内容不正确');
    if (error.message.includes('platform_commercial_quote_locked')) throw new ApiError(409, '项目当前阶段不能出具新的报价草案');
    if (error.message.includes('platform_commercial_quote_entitled')) throw new ApiError(409, '项目商业权益已经处理，不能继续修改报价草案');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to offer platform commercial quote: ${error.message}`);
  }
  if (!data) throw new Error('Unable to offer platform commercial quote: missing response');
  return data;
}

export async function listPlatformReviewQueue(staffUserId: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select('id,partner_one,partner_two,wedding_date,location,guest_count,plan_id,modules,content_brief,template_content,delivery_scope,data_policy,current_version,updated_at')
    .eq('status', 'content_review')
    .order('updated_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Unable to list platform review queue: ${error.message}`);

  return ((data ?? []) as ReviewQueueRow[]).map((row): PlatformReviewQueueItem => ({
    id: row.id,
    partnerOne: row.partner_one,
    partnerTwo: row.partner_two,
    weddingDate: row.wedding_date ?? '',
    location: row.location,
    guestCount: row.guest_count,
    planId: row.plan_id,
    modules: row.modules,
    contentBrief: isPlatformContentBrief(row.content_brief) ? row.content_brief : { ...DEFAULT_PLATFORM_CONTENT_BRIEF },
    templateContent: normalizePlatformTemplateContent(row.template_content),
    deliveryScope: isPlatformDeliveryScope(row.delivery_scope)
      ? { ...row.delivery_scope, services: [...row.delivery_scope.services] }
      : { ...DEFAULT_PLATFORM_DELIVERY_SCOPE, services: [...DEFAULT_PLATFORM_DELIVERY_SCOPE.services] },
    dataPolicy: normalizePlatformDataPolicy(row.data_policy),
    version: row.current_version,
    submittedAt: row.updated_at,
  }));
}

export async function listPlatformProvisioningQueue(staffUserId: string): Promise<PlatformProvisioningQueueItem[]> {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select('id,partner_one,partner_two,wedding_date,location,plan_id,current_version,updated_at,status,delivery_scope')
    .in('status', ['provisioning', 'ready', 'live'])
    .order('updated_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Unable to list platform provisioning queue: ${error.message}`);
  const projects = (data ?? []) as ProvisioningProjectRow[];
  if (!projects.length) return [];
  const projectIds = projects.map((project) => project.id);
  const [entitlementsResult, manifestsResult, fulfillmentPlansResult, instancesResult, releaseEventsResult, customerEventsResult] = await Promise.all([
    client.from('platform_entitlements').select('project_id,status').in('project_id', projectIds),
    client.from('platform_provisioning_manifests').select('project_id,project_version,manifest_hash,created_at').in('project_id', projectIds),
    client.from('platform_fulfillment_plans').select('project_id,project_version,lane,status,runtime_model,created_at').in('project_id', projectIds),
    client.from('platform_runtime_instances').select('id,project_id,project_version,manifest_hash,target_origin,deployment_ref,status,registered_at,verified_at,ready_at').in('project_id', projectIds),
    client.from('platform_runtime_release_events').select('id,project_id,action,project_version,manifest_hash,target_origin,deployment_ref,note,created_at').in('project_id', projectIds).order('created_at', { ascending: true }),
    client.from('platform_customer_delivery_events').select('release_event_id,customer_message').in('project_id', projectIds),
  ]);
  if (entitlementsResult.error) throw new Error(`Unable to read provisioning entitlements: ${entitlementsResult.error.message}`);
  if (manifestsResult.error) throw new Error(`Unable to read provisioning manifests: ${manifestsResult.error.message}`);
  if (fulfillmentPlansResult.error) throw new Error(`Unable to read fulfillment plans: ${fulfillmentPlansResult.error.message}`);
  if (instancesResult.error) throw new Error(`Unable to read runtime instances: ${instancesResult.error.message}`);
  if (releaseEventsResult.error) throw new Error(`Unable to read runtime release events: ${releaseEventsResult.error.message}`);
  if (customerEventsResult.error) throw new Error(`Unable to read customer delivery events: ${customerEventsResult.error.message}`);
  const entitlements = new Map(((entitlementsResult.data ?? []) as ProvisioningEntitlementRow[]).map((row) => [row.project_id, row.status]));
  const manifests = new Map(((manifestsResult.data ?? []) as ProvisioningManifestRow[]).map((row) => [row.project_id, row]));
  const fulfillmentPlans = new Map(((fulfillmentPlansResult.data ?? []) as FulfillmentPlanRow[]).map((row) => [row.project_id, row]));
  const instanceRows = (instancesResult.data ?? []) as RuntimeInstanceRow[];
  const attestationResult = instanceRows.length
    ? await client.from('platform_runtime_instance_attestations').select('id,instance_id,stage,note,created_at').in('instance_id', instanceRows.map((row) => row.id)).order('created_at', { ascending: true })
    : { data: [], error: null };
  if (attestationResult.error) throw new Error(`Unable to read runtime instance attestations: ${attestationResult.error.message}`);
  const attestationsByInstance = new Map<string, PlatformRuntimeAttestationDto[]>();
  for (const row of (attestationResult.data ?? []) as RuntimeAttestationRow[]) {
    const current = attestationsByInstance.get(row.instance_id) ?? [];
    current.push({ id: row.id, stage: row.stage, note: row.note, createdAt: row.created_at });
    attestationsByInstance.set(row.instance_id, current);
  }
  const instances = new Map(instanceRows.map((row) => [row.project_id, row]));
  const customerMessages = new Map(((customerEventsResult.data ?? []) as CustomerDeliveryEventRow[]).map((row) => [row.release_event_id, row.customer_message]));
  const releasesByProject = new Map<string, PlatformRuntimeReleaseEventDto[]>();
  for (const row of (releaseEventsResult.data ?? []) as RuntimeReleaseEventRow[]) {
    const current = releasesByProject.get(row.project_id) ?? [];
    current.push({
      id: row.id,
      action: row.action,
      projectVersion: row.project_version,
      manifestHash: row.manifest_hash,
      targetOrigin: row.target_origin,
      deploymentRef: row.deployment_ref,
      note: row.note,
      customerMessage: customerMessages.get(row.id) ?? '客户交付摘要尚未建立',
      createdAt: row.created_at,
    });
    releasesByProject.set(row.project_id, current);
  }
  return projects.map((project) => {
    const manifest = manifests.get(project.id);
    const fulfillmentPlan = fulfillmentPlans.get(project.id);
    const instance = instances.get(project.id);
    return {
      id: project.id,
      partnerOne: project.partner_one,
      partnerTwo: project.partner_two,
      weddingDate: project.wedding_date ?? '',
      location: project.location,
      planId: project.plan_id,
      version: project.current_version,
      updatedAt: project.updated_at,
      projectStatus: project.status,
      entitlementStatus: entitlements.get(project.id) ?? 'pending',
      deliveryScope: isPlatformDeliveryScope(project.delivery_scope)
        ? { ...project.delivery_scope, services: [...project.delivery_scope.services] }
        : { ...DEFAULT_PLATFORM_DELIVERY_SCOPE, services: [...DEFAULT_PLATFORM_DELIVERY_SCOPE.services] },
      manifest: manifest ? { projectVersion: manifest.project_version, hash: manifest.manifest_hash, createdAt: manifest.created_at } : null,
      fulfillmentPlan: fulfillmentPlan ? {
        projectVersion: fulfillmentPlan.project_version,
        lane: fulfillmentPlan.lane,
        status: fulfillmentPlan.status,
        runtimeModel: fulfillmentPlan.runtime_model,
        createdAt: fulfillmentPlan.created_at,
      } : null,
      releaseEvents: releasesByProject.get(project.id) ?? [],
      instance: instance ? {
        id: instance.id,
        projectVersion: instance.project_version,
        manifestHash: instance.manifest_hash,
        targetOrigin: instance.target_origin,
        deploymentRef: instance.deployment_ref,
        status: instance.status,
        registeredAt: instance.registered_at,
        verifiedAt: instance.verified_at,
        readyAt: instance.ready_at,
        attestations: attestationsByInstance.get(instance.id) ?? [],
      } : null,
    };
  });
}

export async function recordPlatformRuntimeRelease(
  staffUserId: string,
  projectId: string,
  eventKey: string,
  action: PlatformRuntimeReleaseAction,
  checklist: PlatformRuntimeReleaseChecklist,
  note: string,
  customerMessage: string,
) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_record_runtime_release_v2', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_action: action,
    p_checklist: checklist,
    p_note: note,
    p_customer_message: customerMessage,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_runtime_release_invalid')) throw new ApiError(400, '正式发布清单或记录格式不正确');
    if (error.message.includes('platform_runtime_release_out_of_order')) throw new ApiError(409, '项目当前不能执行这个发布动作，请刷新后核对状态');
    if (error.message.includes('platform_runtime_release_prerequisite')) throw new ApiError(409, '实例、配置清单、权益或彩排记录已经变化，请重新核对');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to record platform runtime release: ${error.message}`);
  }
  if (!data) throw new Error('Unable to record platform runtime release: missing response');
  return data;
}

export async function attestPlatformRuntimeInstance(
  staffUserId: string,
  projectId: string,
  eventKey: string,
  stage: PlatformRuntimeAttestationStage,
  checklist: PlatformRuntimeChecklist,
  note: string,
) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_attest_runtime_instance', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_stage: stage,
    p_checklist: checklist,
    p_note: note,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_instance_attestation_invalid')) throw new ApiError(400, '实例核验清单或记录格式不正确');
    if (error.message.includes('platform_instance_not_found')) throw new ApiError(404, '这场婚礼还没有登记独立实例');
    if (error.message.includes('platform_instance_attestation_out_of_order')) throw new ApiError(409, '实例核验步骤顺序不正确，请刷新后继续');
    if (error.message.includes('platform_instance_attestation_prerequisite')) throw new ApiError(409, '清单、权益或实例版本已变化，请重新核对');
    if (error.message.includes('platform_instance_attestation_exists')) throw new ApiError(409, '这个核验阶段已经由其他操作记录');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to attest platform runtime instance: ${error.message}`);
  }
  if (!data) throw new Error('Unable to attest platform runtime instance: missing response');
  return data;
}

export async function registerPlatformRuntimeInstance(
  staffUserId: string,
  projectId: string,
  eventKey: string,
  targetOrigin: string,
  deploymentRef: string,
) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_register_runtime_instance', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_target_origin: targetOrigin,
    p_deployment_ref: deploymentRef,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_instance_invalid')) throw new ApiError(400, '实例网址或部署标识格式不正确');
    if (error.message.includes('platform_instance_project_locked')) throw new ApiError(409, '项目当前不允许登记运行实例');
    if (error.message.includes('platform_instance_manifest_required')) throw new ApiError(409, '请先锁定当前批准版本的配置清单');
    if (error.message.includes('platform_fulfillment_plan_required')) throw new ApiError(409, '请先生成并锁定当前版本的交付路径');
    if (error.message.includes('platform_instance_entitlement_required')) throw new ApiError(409, '商业权益尚未激活，不能登记运行实例');
    if (error.message.includes('platform_instance_already_registered')) throw new ApiError(409, '这个项目已经登记了运行实例');
    if (error.message.includes('platform_instance_target_in_use')) throw new ApiError(409, '这个实例网址已经绑定到其他项目');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to register platform runtime instance: ${error.message}`);
  }
  if (!data) throw new Error('Unable to register platform runtime instance: missing response');
  return data;
}

export async function lockPlatformProvisioningManifest(staffUserId: string, projectId: string, eventKey: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_lock_provisioning_manifest', {
    p_event_key: eventKey,
    p_project_id: projectId,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_manifest_locked')) throw new ApiError(409, '项目尚未进入实例准备阶段');
    if (error.message.includes('platform_manifest_not_ready')) throw new ApiError(409, '批准版本不完整，无法生成实例配置清单');
    if (error.message.includes('platform_manifest_hash_unavailable')) throw new ApiError(503, '平台数据库缺少配置清单签名能力，请联系技术人员');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to lock platform provisioning manifest: ${error.message}`);
  }
  if (!data) throw new Error('Unable to lock platform provisioning manifest: missing response');
  return data;
}

export async function planPlatformProjectFulfillment(staffUserId: string, projectId: string, eventKey: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_plan_project_fulfillment', {
    p_event_key: eventKey,
    p_project_id: projectId,
  }).single();
  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_fulfillment_plan_invalid')) throw new ApiError(400, '交付路径请求格式不正确');
    if (error.message.includes('platform_fulfillment_plan_locked')) throw new ApiError(409, '项目当前阶段不能生成交付路径');
    if (error.message.includes('platform_fulfillment_manifest_required')) throw new ApiError(409, '请先锁定当前批准版本的配置清单');
    if (error.message.includes('platform_fulfillment_runtime_exists')) throw new ApiError(409, '项目已经登记运行实例，不能重新生成交付路径');
    if (error.message.includes('platform_fulfillment_plan_exists')) throw new ApiError(409, '这个项目已经生成交付路径');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to plan platform fulfillment: ${error.message}`);
  }
  if (!data) throw new Error('Unable to plan platform fulfillment: missing response');
  return data;
}

export async function getPlatformProvisioningManifest(staffUserId: string, projectId: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_provisioning_manifests')
    .select('project_id,project_version,manifest,manifest_hash,created_at')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`Unable to read platform provisioning manifest: ${error.message}`);
  if (!data) throw new ApiError(404, '这场婚礼还没有锁定实例配置清单');
  return data as ProvisioningManifestRow & { manifest: PlatformProvisioningManifest };
}

export async function reviewPlatformProject(
  staffUserId: string,
  projectId: string,
  eventKey: string,
  decision: PlatformReviewDecision,
  note: string,
) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_review_project', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_decision: decision,
    p_note: note,
  }).single();

  if (error) {
    if (error.message.includes('platform_staff_required')) throw new ApiError(403, '此账号没有平台运营权限');
    if (error.message.includes('platform_project_not_found')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_project_locked')) throw new ApiError(409, '项目已经离开待审核状态');
    if (error.message.includes('platform_project_not_ready')) throw new ApiError(409, '宾客资料生命周期责任尚未完整确认，不能批准进入实例准备');
    if (error.message.includes('platform_review_invalid')) throw new ApiError(400, '审核决定格式不正确');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to review platform project: ${error.message}`);
  }

  const row = data as {
    id: string;
    status: string;
    current_version: number;
    review_id: string;
    decision: PlatformReviewDecision;
    note: string;
    reviewed_at: string;
  } | null;
  if (!row) throw new Error('Unable to review platform project: missing response');
  return {
    id: row.id,
    status: row.status,
    version: row.current_version,
    reviewId: row.review_id,
    decision: row.decision,
    note: row.note,
    reviewedAt: row.reviewed_at,
  };
}
