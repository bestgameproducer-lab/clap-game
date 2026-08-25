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
import { createPlatformServerClient } from '../platform/supabase-server';
import type { PlatformReviewDecision } from '../validation/platform-operations';

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
  version: number;
  submittedAt: string;
};

export type PlatformProvisioningManifest = {
  schemaVersion: 'wedding-instance-config/v1';
  source: { projectId: string; projectVersion: number; templateId: string; templateVersion: string };
  wedding: { displayName: string; partnerOne: string; partnerTwo: string; date: string; location: string; guestCapacity: number };
  experience: { theme: string; tone: string; modules: string[]; language: string; interaction: string; guestMix: string; templateContent: PlatformTemplateContent };
  delivery: { plan: 'buyout' | 'subscription' };
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
  entitlementStatus: 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired';
  manifest: null | { projectVersion: number; hash: string; createdAt: string };
  instance: null | {
    id: string;
    projectVersion: number;
    manifestHash: string;
    targetOrigin: string;
    deploymentRef: string;
    status: 'registered' | 'verified' | 'ready' | 'suspended' | 'archived';
    registeredAt: string;
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
  current_version: number;
  updated_at: string;
};

type ProvisioningProjectRow = Pick<ReviewQueueRow, 'id' | 'partner_one' | 'partner_two' | 'wedding_date' | 'location' | 'plan_id' | 'current_version' | 'updated_at'>;

type ProvisioningEntitlementRow = { project_id: string; status: PlatformProvisioningQueueItem['entitlementStatus'] };
type ProvisioningManifestRow = { project_id: string; project_version: number; manifest_hash: string; created_at: string; manifest?: unknown };
type RuntimeInstanceRow = {
  id: string;
  project_id: string;
  project_version: number;
  manifest_hash: string;
  target_origin: string;
  deployment_ref: string;
  status: NonNullable<PlatformProvisioningQueueItem['instance']>['status'];
  registered_at: string;
};

export async function listPlatformReviewQueue(staffUserId: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select('id,partner_one,partner_two,wedding_date,location,guest_count,plan_id,modules,content_brief,template_content,delivery_scope,current_version,updated_at')
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
    version: row.current_version,
    submittedAt: row.updated_at,
  }));
}

export async function listPlatformProvisioningQueue(staffUserId: string): Promise<PlatformProvisioningQueueItem[]> {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select('id,partner_one,partner_two,wedding_date,location,plan_id,current_version,updated_at')
    .eq('status', 'provisioning')
    .order('updated_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`Unable to list platform provisioning queue: ${error.message}`);
  const projects = (data ?? []) as ProvisioningProjectRow[];
  if (!projects.length) return [];
  const projectIds = projects.map((project) => project.id);
  const [entitlementsResult, manifestsResult, instancesResult] = await Promise.all([
    client.from('platform_entitlements').select('project_id,status').in('project_id', projectIds),
    client.from('platform_provisioning_manifests').select('project_id,project_version,manifest_hash,created_at').in('project_id', projectIds),
    client.from('platform_runtime_instances').select('id,project_id,project_version,manifest_hash,target_origin,deployment_ref,status,registered_at').in('project_id', projectIds),
  ]);
  if (entitlementsResult.error) throw new Error(`Unable to read provisioning entitlements: ${entitlementsResult.error.message}`);
  if (manifestsResult.error) throw new Error(`Unable to read provisioning manifests: ${manifestsResult.error.message}`);
  if (instancesResult.error) throw new Error(`Unable to read runtime instances: ${instancesResult.error.message}`);
  const entitlements = new Map(((entitlementsResult.data ?? []) as ProvisioningEntitlementRow[]).map((row) => [row.project_id, row.status]));
  const manifests = new Map(((manifestsResult.data ?? []) as ProvisioningManifestRow[]).map((row) => [row.project_id, row]));
  const instances = new Map(((instancesResult.data ?? []) as RuntimeInstanceRow[]).map((row) => [row.project_id, row]));
  return projects.map((project) => {
    const manifest = manifests.get(project.id);
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
      entitlementStatus: entitlements.get(project.id) ?? 'pending',
      manifest: manifest ? { projectVersion: manifest.project_version, hash: manifest.manifest_hash, createdAt: manifest.created_at } : null,
      instance: instance ? {
        id: instance.id,
        projectVersion: instance.project_version,
        manifestHash: instance.manifest_hash,
        targetOrigin: instance.target_origin,
        deploymentRef: instance.deployment_ref,
        status: instance.status,
        registeredAt: instance.registered_at,
      } : null,
    };
  });
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
