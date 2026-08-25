import { ApiError } from '../errors';
import { optionalString, requiredEnum, requiredString, requiredUuid, type JsonObject } from '../validation';
import {
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  type PlatformModuleId,
} from '../platform/catalog';
import { isWeddingDraft, type WeddingDraft } from '../platform/draft';

const PLAN_IDS = PLATFORM_PLANS.map((plan) => plan.id);
const THEME_IDS = PLATFORM_THEMES.map((theme) => theme.id);
const TONE_IDS = PLATFORM_TONES.map((tone) => tone.id);
const MODULE_IDS = PLATFORM_MODULES.map((module) => module.id);

export type PlatformProjectSaveInput = {
  eventKey: string;
  projectId: string | null;
  sourceDraftId: string;
  draft: WeddingDraft & { draftId: string };
};

function optionalProjectId(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  return requiredUuid(value, '项目编号');
}

function validateWeddingDate(value: string) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, '婚礼日期格式不正确');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, '婚礼日期格式不正确');
  }
  return value;
}

function validateModules(value: unknown): PlatformModuleId[] {
  if (!Array.isArray(value) || value.length > MODULE_IDS.length) throw new ApiError(400, '游戏模块格式不正确');
  const modules = value.map((module) => requiredEnum(module, '游戏模块', MODULE_IDS));
  if (new Set(modules).size !== modules.length) throw new ApiError(400, '游戏模块不能重复');
  return modules;
}

export function readPlatformProjectSaveInput(body: JsonObject): PlatformProjectSaveInput {
  if (!isWeddingDraft(body.draft)) throw new ApiError(400, '婚礼方案格式不正确');
  const input = body.draft;
  const sourceDraftId = requiredUuid(input.draftId, '本机草稿编号');

  return {
    eventKey: requiredUuid(body.eventKey, '操作编号'),
    projectId: optionalProjectId(body.projectId),
    sourceDraftId,
    draft: {
      draftId: sourceDraftId,
      partnerOne: optionalString(input.partnerOne, '新人姓名', 120),
      partnerTwo: optionalString(input.partnerTwo, '新人姓名', 120),
      weddingDate: validateWeddingDate(input.weddingDate),
      location: optionalString(input.location, '婚礼地点', 160),
      guestCount: requiredEnum(input.guestCount, '宾客规模', ['40', '80', '120', '180'] as const),
      theme: requiredEnum(input.theme, '视觉方向', THEME_IDS),
      tone: requiredEnum(input.tone, '叙事方向', TONE_IDS),
      plan: requiredEnum(input.plan, '交付方式', PLAN_IDS),
      modules: validateModules(input.modules),
      storyNote: optionalString(input.storyNote, '故事备注', 2000),
    },
  };
}
