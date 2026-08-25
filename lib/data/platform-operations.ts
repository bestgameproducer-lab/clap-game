import 'server-only';
import { ApiError } from '../errors';
import { DEFAULT_PLATFORM_CONTENT_BRIEF, isPlatformContentBrief, type PlatformContentBrief } from '../platform/draft';
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
  version: number;
  submittedAt: string;
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
  current_version: number;
  updated_at: string;
};

export async function listPlatformReviewQueue(staffUserId: string) {
  if (!staffUserId) throw new ApiError(403, '此账号没有平台运营权限');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select('id,partner_one,partner_two,wedding_date,location,guest_count,plan_id,modules,content_brief,current_version,updated_at')
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
    version: row.current_version,
    submittedAt: row.updated_at,
  }));
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
