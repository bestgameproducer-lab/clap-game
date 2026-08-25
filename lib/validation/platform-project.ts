import { ApiError } from '../errors';
import { optionalString, requiredBoolean, requiredEnum, requiredString, requiredUuid, type JsonObject } from '../validation';
import {
  PLATFORM_CUSTOMIZATION_LEVELS,
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_REHEARSAL_MODES,
  PLATFORM_SERVICES,
  PLATFORM_SUPPORT_MODES,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  getPlatformModuleDependencyIssue,
  type PlatformModuleId,
} from '../platform/catalog';
import {
  getWeddingContentBrief,
  getWeddingDeliveryScope,
  getWeddingTemplateContent,
  isWeddingDraft,
  PLATFORM_TEMPLATE_VARIABLES,
  type PlatformContentBrief,
  type PlatformDeliveryScope,
  type PlatformQuickQuizQuestion,
  type PlatformQuizQuestion,
  type PlatformTemplateContent,
  type WeddingDraft,
} from '../platform/draft';
import { PLATFORM_EDITABLE_MISSION_CODES, type PlatformEditableMissionCode } from '../platform/mission-copy';

const PLAN_IDS = PLATFORM_PLANS.map((plan) => plan.id);
const THEME_IDS = PLATFORM_THEMES.map((theme) => theme.id);
const TONE_IDS = PLATFORM_TONES.map((tone) => tone.id);
const MODULE_IDS = PLATFORM_MODULES.map((module) => module.id);
const CUSTOMIZATION_LEVEL_IDS = PLATFORM_CUSTOMIZATION_LEVELS.map((item) => item.id);
const SUPPORT_MODE_IDS = PLATFORM_SUPPORT_MODES.map((item) => item.id);
const REHEARSAL_MODE_IDS = PLATFORM_REHEARSAL_MODES.map((item) => item.id);
const SERVICE_IDS = PLATFORM_SERVICES.map((item) => item.id);

export type PlatformProjectSaveInput = {
  eventKey: string;
  projectId: string | null;
  sourceDraftId: string;
  draft: WeddingDraft & { draftId: string; contentBrief: PlatformContentBrief; templateContent: PlatformTemplateContent; deliveryScope: PlatformDeliveryScope };
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
  const dependencyIssue = getPlatformModuleDependencyIssue(modules);
  if (dependencyIssue) throw new ApiError(400, dependencyIssue);
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

function validateQuickQuizQuestions(value: unknown): PlatformQuickQuizQuestion[] {
  if (!Array.isArray(value) || value.length > 30) throw new ApiError(400, '快问快答最多可以设置 30 题');
  return value.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) throw new ApiError(400, `第 ${index + 1} 道快问快答格式不正确`);
    const item = question as Record<string, unknown>;
    return {
      prompt: plainTemplateText(item.prompt, `第 ${index + 1} 道快问题目`, 180),
      answer: plainTemplateText(item.answer, `第 ${index + 1} 道快问答案`, 120),
    };
  });
}

function validateCharadesWords(value: unknown) {
  if (!Array.isArray(value) || value.length > 80) throw new ApiError(400, '你比划我猜最多可以设置 80 个词');
  return value.map((word, index) => plainTemplateText(word, `第 ${index + 1} 个比划词`, 40));
}

function validateMissionCopyOverrides(value: unknown) {
  if (!Array.isArray(value) || value.length > PLATFORM_EDITABLE_MISSION_CODES.length) {
    throw new ApiError(400, `最多可以定制 ${PLATFORM_EDITABLE_MISSION_CODES.length} 项任务文案`);
  }
  const overrides = value.map((override, index) => {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new ApiError(400, `第 ${index + 1} 项任务文案格式不正确`);
    }
    const item = override as Record<string, unknown>;
    const keys = Object.keys(item).sort().join(',');
    if (keys !== 'description,missionCode,title') throw new ApiError(400, `第 ${index + 1} 项任务文案包含不支持的字段`);
    return {
      missionCode: requiredEnum(item.missionCode, `第 ${index + 1} 项任务编号`, PLATFORM_EDITABLE_MISSION_CODES) as PlatformEditableMissionCode,
      title: plainTemplateText(item.title, `第 ${index + 1} 项任务标题`, 60),
      description: plainTemplateText(item.description, `第 ${index + 1} 项任务说明`, 500),
    };
  });
  if (new Set(overrides.map((override) => override.missionCode)).size !== overrides.length) {
    throw new ApiError(400, '同一项任务只能设置一份自定义文案');
  }
  return overrides;
}

function validateDeliveryScope(scope: PlatformDeliveryScope): PlatformDeliveryScope {
  if (!Array.isArray(scope.services) || scope.services.length < 1 || scope.services.length > SERVICE_IDS.length) {
    throw new ApiError(400, '服务范围格式不正确');
  }
  const services = scope.services.map((service) => requiredEnum(service, '服务项目', SERVICE_IDS));
  if (new Set(services).size !== services.length) throw new ApiError(400, '服务项目不能重复');
  return {
    customizationLevel: requiredEnum(scope.customizationLevel, '定制深度', CUSTOMIZATION_LEVEL_IDS),
    supportMode: requiredEnum(scope.supportMode, '运营支持', SUPPORT_MODE_IDS),
    rehearsalMode: requiredEnum(scope.rehearsalMode, '彩排方式', REHEARSAL_MODE_IDS),
    services,
    serviceNotes: optionalString(scope.serviceNotes, '服务范围备注', 1000),
  };
}

export function readPlatformProjectSaveInput(body: JsonObject): PlatformProjectSaveInput {
  if (!isWeddingDraft(body.draft)) throw new ApiError(400, '婚礼方案格式不正确');
  const input = body.draft;
  const sourceDraftId = requiredUuid(input.draftId, '本机草稿编号');
  const content = getWeddingContentBrief(input);
  const templateContent = getWeddingTemplateContent(input);
  const deliveryScope = getWeddingDeliveryScope(input);

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
        quickQuizQuestions: validateQuickQuizQuestions(templateContent.quickQuizQuestions),
        charadesWords: validateCharadesWords(templateContent.charadesWords),
        missionCopyOverrides: validateMissionCopyOverrides(templateContent.missionCopyOverrides),
      },
      deliveryScope: validateDeliveryScope(deliveryScope),
    },
  };
}

export function readPlatformReviewSubmissionInput(body: JsonObject) {
  return { eventKey: requiredUuid(body.eventKey, '操作编号') };
}
