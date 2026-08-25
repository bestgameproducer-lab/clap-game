import { ApiError } from '../errors';
import { optionalString, requiredBoolean, requiredEnum, requiredString, requiredUuid, type JsonObject } from '../validation';
import {
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  type PlatformModuleId,
} from '../platform/catalog';
import {
  getWeddingContentBrief,
  getWeddingTemplateContent,
  isWeddingDraft,
  PLATFORM_TEMPLATE_VARIABLES,
  type PlatformContentBrief,
  type PlatformQuizQuestion,
  type PlatformTemplateContent,
  type WeddingDraft,
} from '../platform/draft';

const PLAN_IDS = PLATFORM_PLANS.map((plan) => plan.id);
const THEME_IDS = PLATFORM_THEMES.map((theme) => theme.id);
const TONE_IDS = PLATFORM_TONES.map((tone) => tone.id);
const MODULE_IDS = PLATFORM_MODULES.map((module) => module.id);

export type PlatformProjectSaveInput = {
  eventKey: string;
  projectId: string | null;
  sourceDraftId: string;
  draft: WeddingDraft & { draftId: string; contentBrief: PlatformContentBrief; templateContent: PlatformTemplateContent };
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

function plainTemplateText(value: unknown, label: string, maximum: number, allowVariables = false) {
  const result = requiredString(value, label, maximum);
  if (/[<>]/.test(result)) throw new ApiError(400, `${label}不能包含 HTML 标签`);
  if (allowVariables) {
    const variablePattern = new RegExp(`{{(?:${PLATFORM_TEMPLATE_VARIABLES.join('|')})}}`, 'g');
    const withoutAllowedVariables = result.replace(variablePattern, '');
    if (withoutAllowedVariables.includes('{{') || withoutAllowedVariables.includes('}}')) {
      throw new ApiError(400, `${label}包含不支持的变量`);
    }
  } else if (/[{}]/.test(result)) {
    throw new ApiError(400, `${label}不能包含模板变量`);
  }
  return result;
}

function validateQuizQuestions(value: unknown): PlatformQuizQuestion[] {
  if (!Array.isArray(value) || value.length > 20) throw new ApiError(400, '新人问答最多可以设置 20 题');
  return value.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) throw new ApiError(400, `第 ${index + 1} 道新人问答格式不正确`);
    const item = question as Record<string, unknown>;
    return {
      prompt: plainTemplateText(item.prompt, `第 ${index + 1} 道题目`, 180),
      answer: requiredEnum(item.answer, `第 ${index + 1} 道题答案`, ['partnerOne', 'partnerTwo', 'both'] as const),
    };
  });
}

export function readPlatformProjectSaveInput(body: JsonObject): PlatformProjectSaveInput {
  if (!isWeddingDraft(body.draft)) throw new ApiError(400, '婚礼方案格式不正确');
  const input = body.draft;
  const sourceDraftId = requiredUuid(input.draftId, '本机草稿编号');
  const content = getWeddingContentBrief(input);
  const templateContent = getWeddingTemplateContent(input);

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
      contentBrief: {
        language: requiredEnum(content.language, '内容语言', ['chinese', 'bilingual'] as const),
        interaction: requiredEnum(content.interaction, '互动强度', ['gentle', 'balanced', 'immersive'] as const),
        guestMix: requiredEnum(content.guestMix, '宾客构成', ['family', 'balanced', 'friends'] as const),
        storyMoments: optionalString(content.storyMoments, '故事素材', 2000),
        avoidTopics: optionalString(content.avoidTopics, '内容边界', 1200),
        boundariesConfirmed: requiredBoolean(content.boundariesConfirmed, '内容边界确认'),
        hostNotes: optionalString(content.hostNotes, '主持备注', 2000),
      },
      templateContent: {
        teamOneName: plainTemplateText(templateContent.teamOneName, '第一组名称', 40),
        teamTwoName: plainTemplateText(templateContent.teamTwoName, '第二组名称', 40),
        openingScript: plainTemplateText(templateContent.openingScript, '主持人开场口播', 800, true),
        quizQuestions: validateQuizQuestions(templateContent.quizQuestions),
      },
    },
  };
}

export function readPlatformReviewSubmissionInput(body: JsonObject) {
  return { eventKey: requiredUuid(body.eventKey, '操作编号') };
}
