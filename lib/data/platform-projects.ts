import 'server-only';
import { ApiError } from '../errors';
import type { PlatformProjectSaveInput } from '../validation/platform-project';
import { createPlatformServerClient } from '../platform/supabase-server';
import { buildPlatformProjectExport } from '../platform/project-export';
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
import type { PlatformCommercialQuote, PlatformQuoteBillingInterval, PlatformQuoteCurrency } from '../platform/commercial';

export type PlatformProjectDto = {
  id: string;
  sourceDraftId: string;
  status: 'draft' | 'content_review' | 'provisioning' | 'rehearsal' | 'ready' | 'live' | 'archived';
  templateId: string;
  templateVersion: string;
  planId: 'buyout' | 'subscription';
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  guestCount: number;
  themeId: string;
  toneId: string;
  modules: string[];
  storyNote: string;
  contentBrief: PlatformContentBrief;
  templateContent: PlatformTemplateContent;
  deliveryScope: PlatformDeliveryScope;
  dataPolicy: PlatformDataPolicy;
  version: number;
  updatedAt: string;
  accessRole: 'owner' | 'editor' | 'viewer';
};

export type PlatformProjectVersionDto = {
  version: number;
  reason: 'customer_save' | 'content_review' | 'provisioning' | 'operator_restore';
  createdAt: string;
};

export type PlatformEntitlementDto = {
  planId: PlatformProjectDto['planId'];
  status: 'pending' | 'active' | 'past_due' | 'cancelled' | 'expired';
  source: 'unassigned' | 'operator' | 'payment_provider';
  activeFrom: string | null;
  activeUntil: string | null;
};

export type PlatformProjectReviewDto = {
  id: string;
  round: number;
  projectVersion: number;
  decision: 'approved' | 'changes_requested';
  resultingStatus: 'draft' | 'provisioning';
  note: string;
  createdAt: string;
};

export type PlatformCustomerDeliveryEventDto = {
  id: string;
  action: 'release' | 'hold';
  projectVersion: number;
  customerMessage: string;
  createdAt: string;
};

export type PlatformCommercialQuoteRequestDto = {
  id: string;
  projectVersion: number;
  planId: PlatformProjectDto['planId'];
  status: 'requested' | 'superseded';
  requestedAt: string;
  supersededAt: string | null;
};

export type PlatformQuoteProceedRequestDto = {
  quoteId: string;
  projectVersion: number;
  status: 'requested' | 'superseded';
  requestedAt: string;
  supersededAt: string | null;
};

type PlatformProjectRow = {
  id: string;
  owner_user_id: string;
  source_draft_id?: string;
  status: PlatformProjectDto['status'];
  template_id: string;
  template_version: string;
  plan_id: PlatformProjectDto['planId'];
  partner_one: string;
  partner_two: string;
  wedding_date: string | null;
  location: string;
  guest_count: number;
  theme_id: string;
  tone_id: string;
  modules: string[];
  story_note: string;
  content_brief?: unknown;
  template_content?: unknown;
  delivery_scope?: unknown;
  data_policy?: unknown;
  current_version: number;
  updated_at: string;
};

type PlatformProjectVersionRow = {
  version: number;
  reason: PlatformProjectVersionDto['reason'];
  created_at: string;
};

type PlatformEntitlementRow = {
  plan_id: PlatformEntitlementDto['planId'];
  status: PlatformEntitlementDto['status'];
  source: PlatformEntitlementDto['source'];
  active_from: string | null;
  active_until: string | null;
};

type PlatformProjectReviewRow = {
  id: string;
  review_round: number;
  project_version: number;
  decision: PlatformProjectReviewDto['decision'];
  resulting_status: PlatformProjectReviewDto['resultingStatus'];
  note: string;
  created_at: string;
};

type PlatformProjectMemberRow = {
  project_id: string;
  user_id: string;
  email: string;
  role: 'editor' | 'viewer';
  created_at: string;
};

type PlatformProjectInvitationRow = {
  id: string;
  project_id: string;
  role: 'editor' | 'viewer';
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};

type PlatformCustomerDeliveryEventRow = {
  release_event_id: string;
  action: PlatformCustomerDeliveryEventDto['action'];
  project_version: number;
  customer_message: string;
  created_at: string;
};

type PlatformCommercialQuoteRequestRow = {
  id: string;
  project_version: number;
  plan_id: PlatformProjectDto['planId'];
  status: PlatformCommercialQuoteRequestDto['status'];
  requested_at: string;
  superseded_at: string | null;
};

type PlatformCommercialQuoteRow = {
  id: string;
  quote_request_id: string;
  project_version: number;
  plan_id: PlatformProjectDto['planId'];
  amount_minor: number | string;
  currency: PlatformQuoteCurrency;
  billing_interval: PlatformQuoteBillingInterval;
  valid_until: string;
  service_summary: string;
  terms_summary: string;
  status: PlatformCommercialQuote['status'];
  offered_at: string;
};

type PlatformQuoteProceedRequestRow = {
  quote_id: string;
  project_version: number;
  status: PlatformQuoteProceedRequestDto['status'];
  requested_at: string;
  superseded_at: string | null;
};

const PROJECT_FIELDS = 'id,owner_user_id,source_draft_id,status,template_id,template_version,plan_id,partner_one,partner_two,wedding_date,location,guest_count,theme_id,tone_id,modules,story_note,content_brief,template_content,delivery_scope,data_policy,current_version,updated_at';

function toDto(row: PlatformProjectRow, accessRole: PlatformProjectDto['accessRole'], sourceDraftId = row.source_draft_id): PlatformProjectDto {
  if (!sourceDraftId) throw new Error('Unable to map platform project without a source draft');
  return {
    id: row.id,
    sourceDraftId,
    status: row.status,
    templateId: row.template_id,
    templateVersion: row.template_version,
    planId: row.plan_id,
    partnerOne: row.partner_one,
    partnerTwo: row.partner_two,
    weddingDate: row.wedding_date ?? '',
    location: row.location,
    guestCount: row.guest_count,
    themeId: row.theme_id,
    toneId: row.tone_id,
    modules: row.modules,
    storyNote: row.story_note,
    contentBrief: isPlatformContentBrief(row.content_brief) ? row.content_brief : { ...DEFAULT_PLATFORM_CONTENT_BRIEF },
    templateContent: normalizePlatformTemplateContent(row.template_content),
    deliveryScope: isPlatformDeliveryScope(row.delivery_scope)
      ? { ...row.delivery_scope, services: [...row.delivery_scope.services] }
      : { ...DEFAULT_PLATFORM_DELIVERY_SCOPE, services: [...DEFAULT_PLATFORM_DELIVERY_SCOPE.services] },
    dataPolicy: normalizePlatformDataPolicy(row.data_policy),
    version: row.current_version,
    updatedAt: row.updated_at,
    accessRole,
  };
}

export async function listPlatformProjects(ownerUserId: string) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select(PROJECT_FIELDS)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Unable to list platform projects: ${error.message}`);
  const rows = (data ?? []) as PlatformProjectRow[];
  if (!rows.length) return [];
  const { data: memberData, error: memberError } = await client
    .from('platform_project_members')
    .select('project_id,user_id,email,role,created_at')
    .eq('user_id', ownerUserId)
    .in('project_id', rows.map((row) => row.id));
  if (memberError) throw new Error(`Unable to list platform project memberships: ${memberError.message}`);
  const roles = new Map(((memberData ?? []) as PlatformProjectMemberRow[]).map((row) => [row.project_id, row.role]));
  return rows.map((row) => toDto(row, row.owner_user_id === ownerUserId ? 'owner' : roles.get(row.id) ?? 'viewer'));
}

export async function getPlatformProjectDetails(ownerUserId: string, projectId: string) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const projectResult = await client.from('platform_projects').select(PROJECT_FIELDS).eq('id', projectId).maybeSingle();
  if (projectResult.error) throw new Error(`Unable to read platform project: ${projectResult.error.message}`);
  if (!projectResult.data) throw new ApiError(404, '没有找到这个客户项目');
  const projectRow = projectResult.data as PlatformProjectRow;
  const [versionsResult, entitlementResult, reviewsResult, membersResult, invitationsResult, deliveryEventsResult, quoteRequestsResult, commercialQuotesResult, proceedRequestsResult] = await Promise.all([
    client.from('platform_project_versions').select('version,reason,created_at').eq('project_id', projectId).order('version', { ascending: false }).limit(50),
    client.from('platform_entitlements').select('plan_id,status,source,active_from,active_until').eq('project_id', projectId).maybeSingle(),
    client.from('platform_project_reviews').select('id,review_round,project_version,decision,resulting_status,note,created_at').eq('project_id', projectId).order('review_round', { ascending: false }).limit(20),
    client.from('platform_project_members').select('project_id,user_id,email,role,created_at').eq('project_id', projectId).order('created_at', { ascending: true }),
    client.from('platform_project_invitations').select('id,project_id,role,accepted_by_user_id,accepted_at,expires_at,revoked_at,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(30),
    client.from('platform_customer_delivery_events').select('release_event_id,action,project_version,customer_message,created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(30),
    client.from('platform_commercial_quote_requests').select('id,project_version,plan_id,status,requested_at,superseded_at').eq('project_id', projectId).order('requested_at', { ascending: false }).limit(20),
    client.from('platform_commercial_quotes').select('id,quote_request_id,project_version,plan_id,amount_minor,currency,billing_interval,valid_until,service_summary,terms_summary,status,offered_at').eq('project_id', projectId).order('offered_at', { ascending: false }).limit(20),
    client.from('platform_quote_proceed_requests').select('quote_id,project_version,status,requested_at,superseded_at').eq('project_id', projectId).order('requested_at', { ascending: false }).limit(20),
  ]);
  if (versionsResult.error) throw new Error(`Unable to read platform project versions: ${versionsResult.error.message}`);
  if (entitlementResult.error) throw new Error(`Unable to read platform entitlement: ${entitlementResult.error.message}`);
  if (reviewsResult.error) throw new Error(`Unable to read platform project reviews: ${reviewsResult.error.message}`);
  if (membersResult.error) throw new Error(`Unable to read platform project members: ${membersResult.error.message}`);
  if (invitationsResult.error) throw new Error(`Unable to read platform project invitations: ${invitationsResult.error.message}`);
  if (deliveryEventsResult.error) throw new Error(`Unable to read customer delivery events: ${deliveryEventsResult.error.message}`);
  if (quoteRequestsResult.error) throw new Error(`Unable to read commercial quote requests: ${quoteRequestsResult.error.message}`);
  if (commercialQuotesResult.error) throw new Error(`Unable to read commercial quote drafts: ${commercialQuotesResult.error.message}`);
  if (proceedRequestsResult.error) throw new Error(`Unable to read quote proceed requests: ${proceedRequestsResult.error.message}`);

  const versions = ((versionsResult.data ?? []) as PlatformProjectVersionRow[]).map((row): PlatformProjectVersionDto => ({
    version: row.version,
    reason: row.reason,
    createdAt: row.created_at,
  }));
  const entitlementRow = entitlementResult.data as PlatformEntitlementRow | null;
  const entitlement: PlatformEntitlementDto | null = entitlementRow ? {
    planId: entitlementRow.plan_id,
    status: entitlementRow.status,
    source: entitlementRow.source,
    activeFrom: entitlementRow.active_from,
    activeUntil: entitlementRow.active_until,
  } : null;
  const reviews = ((reviewsResult.data ?? []) as PlatformProjectReviewRow[]).map((row): PlatformProjectReviewDto => ({
    id: row.id,
    round: row.review_round,
    projectVersion: row.project_version,
    decision: row.decision,
    resultingStatus: row.resulting_status,
    note: row.note,
    createdAt: row.created_at,
  }));
  const memberRows = (membersResult.data ?? []) as PlatformProjectMemberRow[];
  const accessRole: PlatformProjectDto['accessRole'] = projectRow.owner_user_id === ownerUserId
    ? 'owner'
    : memberRows.find((row) => row.user_id === ownerUserId)?.role ?? 'viewer';
  const members = memberRows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  }));
  const invitations = ((invitationsResult.data ?? []) as PlatformProjectInvitationRow[]).map((row) => ({
    id: row.id,
    role: row.role,
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
  const deliveryEvents = ((deliveryEventsResult.data ?? []) as PlatformCustomerDeliveryEventRow[]).map((row): PlatformCustomerDeliveryEventDto => ({
    id: row.release_event_id,
    action: row.action,
    projectVersion: row.project_version,
    customerMessage: row.customer_message,
    createdAt: row.created_at,
  }));
  const quoteRequests = ((quoteRequestsResult.data ?? []) as PlatformCommercialQuoteRequestRow[]).map((row): PlatformCommercialQuoteRequestDto => ({
    id: row.id,
    projectVersion: row.project_version,
    planId: row.plan_id,
    status: row.status,
    requestedAt: row.requested_at,
    supersededAt: row.superseded_at,
  }));
  const commercialQuotes = ((commercialQuotesResult.data ?? []) as PlatformCommercialQuoteRow[]).map((row): PlatformCommercialQuote => ({
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
  }));
  const proceedRequests = ((proceedRequestsResult.data ?? []) as PlatformQuoteProceedRequestRow[]).map((row): PlatformQuoteProceedRequestDto => ({
    quoteId: row.quote_id,
    projectVersion: row.project_version,
    status: row.status,
    requestedAt: row.requested_at,
    supersededAt: row.superseded_at,
  }));

  return {
    project: toDto(projectRow, accessRole),
    versions,
    entitlement,
    reviews,
    members,
    invitations,
    deliveryEvents,
    quoteRequests,
    commercialQuotes,
    proceedRequests,
  };
}

export async function requestPlatformQuoteProceed(
  ownerUserId: string,
  projectId: string,
  eventKey: string,
  quoteId: string,
  acknowledgedNoPayment: boolean,
) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_request_quote_proceed', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_quote_id: quoteId,
    p_acknowledged_no_payment: acknowledgedNoPayment,
  }).single();
  if (error) {
    if (error.message.includes('platform_project_not_owned')) throw new ApiError(403, '只有项目所有者可以申请进入下一步沟通');
    if (error.message.includes('platform_quote_proceed_invalid')) throw new ApiError(400, '报价下一步请求格式不正确');
    if (error.message.includes('platform_commercial_quote_not_found')) throw new ApiError(404, '没有找到这份报价草案');
    if (error.message.includes('platform_commercial_quote_unavailable')) throw new ApiError(409, '报价已经过期或被替换，请刷新后核对最新草案');
    if (error.message.includes('platform_quote_proceed_locked')) throw new ApiError(409, '项目当前阶段不能申请进入商业下一步');
    if (error.message.includes('platform_quote_proceed_entitled')) throw new ApiError(409, '商业权益已经处理，不需要重复申请');
    if (error.message.includes('platform_quote_proceed_exists')) throw new ApiError(409, '已经提交过这份报价的下一步申请');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to request quote proceed: ${error.message}`);
  }
  if (!data) throw new Error('Unable to request quote proceed: missing response');
  return data;
}

export async function requestPlatformCommercialQuote(
  ownerUserId: string,
  projectId: string,
  eventKey: string,
  projectVersion: number,
) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_request_commercial_quote', {
    p_event_key: eventKey,
    p_project_id: projectId,
    p_project_version: projectVersion,
  }).single();
  if (error) {
    if (error.message.includes('platform_project_not_owned')) throw new ApiError(403, '只有项目所有者可以申请正式报价');
    if (error.message.includes('platform_quote_request_invalid')) throw new ApiError(400, '询价请求格式不正确');
    if (error.message.includes('platform_quote_request_locked')) throw new ApiError(409, '项目当前阶段不能重新申请报价');
    if (error.message.includes('platform_quote_request_stale')) throw new ApiError(409, '项目版本已经变化，请刷新后重新核对');
    if (error.message.includes('platform_quote_request_entitled')) throw new ApiError(409, '这个项目的商业权益已经处理，不需要重复询价');
    if (error.message.includes('platform_quote_request_exists')) throw new ApiError(409, '当前方案已经有一条待处理询价');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to request platform commercial quote: ${error.message}`);
  }
  if (!data) throw new Error('Unable to request platform commercial quote: missing response');
  return data;
}

export async function exportPlatformProjectDraft(ownerUserId: string, projectId: string) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client.from('platform_projects').select(PROJECT_FIELDS).eq('id', projectId).maybeSingle();
  if (error) throw new Error(`Unable to read platform project export: ${error.message}`);
  if (!data) throw new ApiError(404, '没有找到这个客户项目');
  const row = data as PlatformProjectRow;
  if (row.owner_user_id !== ownerUserId) throw new ApiError(403, '只有项目所有者可以下载完整方案备份');
  return buildPlatformProjectExport(toDto(row, 'owner'), new Date().toISOString());
}

export async function savePlatformProject(ownerUserId: string, input: PlatformProjectSaveInput) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { draft } = input;
  const { data, error } = await client.rpc('platform_save_customized_project_draft_v6', {
    p_event_key: input.eventKey,
    p_project_id: input.projectId,
    p_source_draft_id: input.sourceDraftId,
    p_template_id: 'cupid-wedding-trial',
    p_template_version: '2026.08',
    p_plan_id: draft.plan,
    p_partner_one: draft.partnerOne,
    p_partner_two: draft.partnerTwo,
    p_wedding_date: draft.weddingDate || null,
    p_location: draft.location,
    p_guest_count: Number(draft.guestCount),
    p_theme_id: draft.theme,
    p_tone_id: draft.tone,
    p_modules: draft.modules,
    p_story_note: draft.storyNote,
    p_content_brief: draft.contentBrief,
    p_template_content: draft.templateContent,
    p_delivery_scope: draft.deliveryScope,
    p_data_policy: draft.dataPolicy,
  }).single();

  if (error) {
    if (error.message.includes('platform_project_not_owned')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_project_locked')) throw new ApiError(409, '项目已经进入制作，不能覆盖当前版本');
    if (error.message.includes('platform_project_invalid')) throw new ApiError(400, '婚礼方案没有通过服务端校验');
    throw new Error(`Unable to save platform project: ${error.message}`);
  }
  const row = data as PlatformProjectRow | null;
  if (!row) throw new Error('Unable to save platform project: missing response');
  const { data: ownership, error: ownershipError } = await client
    .from('platform_projects')
    .select('owner_user_id')
    .eq('id', row.id)
    .single();
  if (ownershipError || !ownership) throw new Error(`Unable to verify platform project ownership: ${ownershipError?.message ?? 'missing response'}`);
  const accessRole: PlatformProjectDto['accessRole'] = ownership.owner_user_id === ownerUserId ? 'owner' : 'editor';
  return toDto(row, accessRole, input.sourceDraftId);
}

export async function submitPlatformProjectForReview(ownerUserId: string, projectId: string, eventKey: string) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client.rpc('platform_submit_project_for_review', {
    p_event_key: eventKey,
    p_project_id: projectId,
  }).single();

  if (error) {
    if (error.message.includes('platform_project_not_owned')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_project_not_ready')) throw new ApiError(409, '项目资料尚未准备完成');
    if (error.message.includes('platform_project_locked')) throw new ApiError(409, '项目已经提交，不能重复推进');
    if (error.message.includes('platform_event_conflict')) throw new ApiError(409, '操作编号已经用于其他请求');
    throw new Error(`Unable to submit platform project for review: ${error.message}`);
  }

  const row = data as { id: string; status: PlatformProjectDto['status']; current_version: number; updated_at: string } | null;
  if (!row) throw new Error('Unable to submit platform project for review: missing response');
  return { id: row.id, status: row.status, version: row.current_version, updatedAt: row.updated_at };
}
