import 'server-only';
import { ApiError } from '../errors';
import type { PlatformProjectSaveInput } from '../validation/platform-project';
import { createPlatformServerClient } from '../platform/supabase-server';

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
  version: number;
  updatedAt: string;
};

type PlatformProjectRow = {
  id: string;
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
  current_version: number;
  updated_at: string;
};

const PROJECT_FIELDS = 'id,source_draft_id,status,template_id,template_version,plan_id,partner_one,partner_two,wedding_date,location,guest_count,theme_id,tone_id,modules,story_note,current_version,updated_at';

function toDto(row: PlatformProjectRow, sourceDraftId = row.source_draft_id): PlatformProjectDto {
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
    version: row.current_version,
    updatedAt: row.updated_at,
  };
}

export async function listPlatformProjects(ownerUserId: string) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_projects')
    .select(PROJECT_FIELDS)
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Unable to list platform projects: ${error.message}`);
  return ((data ?? []) as PlatformProjectRow[]).map((row) => toDto(row));
}

export async function savePlatformProject(ownerUserId: string, input: PlatformProjectSaveInput) {
  if (!ownerUserId) throw new ApiError(401, '请先登录客户账号');
  const client = await createPlatformServerClient();
  const { draft } = input;
  const { data, error } = await client.rpc('platform_save_project_draft', {
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
  }).single();

  if (error) {
    if (error.message.includes('platform_project_not_owned')) throw new ApiError(404, '没有找到这个客户项目');
    if (error.message.includes('platform_project_locked')) throw new ApiError(409, '项目已经进入制作，不能覆盖当前版本');
    if (error.message.includes('platform_project_invalid')) throw new ApiError(400, '婚礼方案没有通过服务端校验');
    throw new Error(`Unable to save platform project: ${error.message}`);
  }
  const row = data as PlatformProjectRow | null;
  if (!row) throw new Error('Unable to save platform project: missing response');
  return toDto(row, input.sourceDraftId);
}
