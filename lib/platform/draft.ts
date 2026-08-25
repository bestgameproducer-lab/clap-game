import {
  FLAGSHIP_TEMPLATE,
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_CUSTOMIZATION_LEVELS,
  PLATFORM_REHEARSAL_MODES,
  PLATFORM_SERVICES,
  PLATFORM_SUPPORT_MODES,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  type PlatformModuleId,
  type PlatformPlanId,
  type PlatformCustomizationLevelId,
  type PlatformRehearsalModeId,
  type PlatformServiceId,
  type PlatformSupportModeId,
  type PlatformThemeId,
  type PlatformToneId,
} from './catalog';
import { PLATFORM_EDITABLE_MISSION_CODES, isPlatformEditableMissionCode, type PlatformEditableMissionCode } from './mission-copy';
import {
  DEFAULT_PLATFORM_DATA_POLICY,
  isPlatformDataPolicy,
  normalizePlatformDataPolicy,
  type PlatformDataPolicy,
} from './data-policy';

export const PLATFORM_DRAFT_STORAGE_KEY = 'wedding-play-studio-draft-v1';

export type PlatformQuizQuestion = {
  prompt: string;
  answer: 'partnerOne' | 'partnerTwo' | 'both';
};

export type PlatformQuickQuizQuestion = {
  prompt: string;
  answer: string;
};

export type PlatformMissionCopyOverride = {
  missionCode: PlatformEditableMissionCode;
  title: string;
  description: string;
};

export type PlatformTemplateContent = {
  teamOneName: string;
  teamTwoName: string;
  openingScript: string;
  quizQuestions: PlatformQuizQuestion[];
  quickQuizQuestions: PlatformQuickQuizQuestion[];
  charadesWords: string[];
  missionCopyOverrides: PlatformMissionCopyOverride[];
};

export const PLATFORM_TEMPLATE_VARIABLES = ['partnerOne', 'partnerTwo', 'couple', 'location', 'weddingDate'] as const;

export const DEFAULT_PLATFORM_TEMPLATE_CONTENT: PlatformTemplateContent = {
  teamOneName: '海岛组',
  teamTwoName: '沙漠组',
  openingScript: '欢迎来到 {{couple}} 的婚礼游戏。今晚请跟随主持人提示，一起完成属于你们的故事。',
  quizQuestions: [],
  quickQuizQuestions: [
    { prompt: '一年有多少个月？', answer: '12 个月' },
    { prompt: '彩虹通常有几种颜色？', answer: '7 种' },
  ],
  charadesWords: ['交换戒指', '手捧花', '蜜月旅行', '婚礼蛋糕', '干杯', '拍合照'],
  missionCopyOverrides: [],
};

export type PlatformContentBrief = {
  language: 'chinese' | 'bilingual';
  interaction: 'gentle' | 'balanced' | 'immersive';
  guestMix: 'family' | 'balanced' | 'friends';
  storyMoments: string;
  avoidTopics: string;
  boundariesConfirmed: boolean;
  hostNotes: string;
};

export const DEFAULT_PLATFORM_CONTENT_BRIEF: PlatformContentBrief = {
  language: 'chinese',
  interaction: 'balanced',
  guestMix: 'balanced',
  storyMoments: '',
  avoidTopics: '',
  boundariesConfirmed: false,
  hostNotes: '',
};

export type PlatformDeliveryScope = {
  customizationLevel: PlatformCustomizationLevelId;
  supportMode: PlatformSupportModeId;
  rehearsalMode: PlatformRehearsalModeId;
  services: PlatformServiceId[];
  serviceNotes: string;
};

export const DEFAULT_PLATFORM_DELIVERY_SCOPE: PlatformDeliveryScope = {
  customizationLevel: 'guided',
  supportMode: 'remote_guided',
  rehearsalMode: 'full_rehearsal',
  services: ['brand-adaptation', 'content-workshop', 'host-runbook', 'archive-export'],
  serviceNotes: '',
};

export type WeddingDraft = {
  draftId?: string;
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  guestCount: '40' | '80' | '120' | '180';
  theme: PlatformThemeId;
  tone: PlatformToneId;
  plan: PlatformPlanId;
  modules: PlatformModuleId[];
  storyNote: string;
  contentBrief?: PlatformContentBrief;
  templateContent?: PlatformTemplateContent;
  deliveryScope?: PlatformDeliveryScope;
  dataPolicy?: PlatformDataPolicy;
};

const DEFAULT_MODULES: PlatformModuleId[] = [
  'secret-missions',
  'team-games',
  'host-toolkit',
  'live-scoreboard',
  'finale-vote',
];

export function createPlatformDraftId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export function isPlatformContentBrief(value: unknown): value is PlatformContentBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const brief = value as Partial<PlatformContentBrief>;
  return (
    (brief.language === 'chinese' || brief.language === 'bilingual') &&
    (brief.interaction === 'gentle' || brief.interaction === 'balanced' || brief.interaction === 'immersive') &&
    (brief.guestMix === 'family' || brief.guestMix === 'balanced' || brief.guestMix === 'friends') &&
    typeof brief.storyMoments === 'string' &&
    typeof brief.avoidTopics === 'string' &&
    typeof brief.boundariesConfirmed === 'boolean' &&
    typeof brief.hostNotes === 'string'
  );
}

export function getWeddingContentBrief(draft: WeddingDraft): PlatformContentBrief {
  return isPlatformContentBrief(draft.contentBrief)
    ? draft.contentBrief
    : { ...DEFAULT_PLATFORM_CONTENT_BRIEF };
}

export function isPlatformDeliveryScope(value: unknown): value is PlatformDeliveryScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scope = value as Partial<PlatformDeliveryScope>;
  const customizationIds = new Set(PLATFORM_CUSTOMIZATION_LEVELS.map((item) => item.id));
  const supportIds = new Set(PLATFORM_SUPPORT_MODES.map((item) => item.id));
  const rehearsalIds = new Set(PLATFORM_REHEARSAL_MODES.map((item) => item.id));
  const serviceIds = new Set(PLATFORM_SERVICES.map((item) => item.id));
  return (
    customizationIds.has(scope.customizationLevel as PlatformCustomizationLevelId)
    && supportIds.has(scope.supportMode as PlatformSupportModeId)
    && rehearsalIds.has(scope.rehearsalMode as PlatformRehearsalModeId)
    && Array.isArray(scope.services)
    && new Set(scope.services).size === scope.services.length
    && scope.services.every((service) => serviceIds.has(service))
    && typeof scope.serviceNotes === 'string'
  );
}

export function getWeddingDeliveryScope(draft: WeddingDraft): PlatformDeliveryScope {
  return isPlatformDeliveryScope(draft.deliveryScope)
    ? { ...draft.deliveryScope, services: [...draft.deliveryScope.services] }
    : { ...DEFAULT_PLATFORM_DELIVERY_SCOPE, services: [...DEFAULT_PLATFORM_DELIVERY_SCOPE.services] };
}

function isPlatformMissionCopyOverride(value: unknown): value is PlatformMissionCopyOverride {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const override = value as Record<string, unknown>;
  const keys = Object.keys(override).sort().join(',');
  return (
    keys === 'description,missionCode,title'
    && isPlatformEditableMissionCode(override.missionCode)
    && typeof override.title === 'string'
    && override.title.trim().length >= 1
    && override.title.trim().length <= 60
    && !/[<>{}]/.test(override.title)
    && typeof override.description === 'string'
    && override.description.trim().length >= 1
    && override.description.trim().length <= 500
    && !/[<>{}]/.test(override.description)
  );
}

export function isPlatformTemplateContent(value: unknown): value is PlatformTemplateContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = value as Partial<PlatformTemplateContent>;
  return (
    typeof content.teamOneName === 'string'
    && typeof content.teamTwoName === 'string'
    && typeof content.openingScript === 'string'
    && Array.isArray(content.quizQuestions)
    && content.quizQuestions.every((question) => Boolean(
      question
      && typeof question === 'object'
      && !Array.isArray(question)
      && typeof question.prompt === 'string'
      && ['partnerOne', 'partnerTwo', 'both'].includes(question.answer),
    ))
    && (content.quickQuizQuestions === undefined || (
      Array.isArray(content.quickQuizQuestions)
      && content.quickQuizQuestions.every((question) => Boolean(
        question
        && typeof question === 'object'
        && !Array.isArray(question)
        && typeof question.prompt === 'string'
        && typeof question.answer === 'string',
      ))
    ))
    && (content.charadesWords === undefined || (
      Array.isArray(content.charadesWords)
      && content.charadesWords.every((word) => typeof word === 'string')
    ))
    && (content.missionCopyOverrides === undefined || (
      Array.isArray(content.missionCopyOverrides)
      && content.missionCopyOverrides.length <= PLATFORM_EDITABLE_MISSION_CODES.length
      && new Set(content.missionCopyOverrides.map((override) => override?.missionCode)).size === content.missionCopyOverrides.length
      && content.missionCopyOverrides.every(isPlatformMissionCopyOverride)
    ))
  );
}

export function normalizePlatformTemplateContent(value: unknown): PlatformTemplateContent {
  if (!isPlatformTemplateContent(value)) {
    return {
      ...DEFAULT_PLATFORM_TEMPLATE_CONTENT,
      quizQuestions: [],
      quickQuizQuestions: DEFAULT_PLATFORM_TEMPLATE_CONTENT.quickQuizQuestions.map((question) => ({ ...question })),
      charadesWords: [...DEFAULT_PLATFORM_TEMPLATE_CONTENT.charadesWords],
      missionCopyOverrides: [],
    };
  }
  return {
    ...value,
    quickQuizQuestions: value.quickQuizQuestions ?? DEFAULT_PLATFORM_TEMPLATE_CONTENT.quickQuizQuestions.map((question) => ({ ...question })),
    charadesWords: value.charadesWords ?? [...DEFAULT_PLATFORM_TEMPLATE_CONTENT.charadesWords],
    missionCopyOverrides: value.missionCopyOverrides ?? [],
  };
}

export function getWeddingTemplateContent(draft: WeddingDraft): PlatformTemplateContent {
  return normalizePlatformTemplateContent(draft.templateContent);
}

export function ensureWeddingDraftId(draft: WeddingDraft): WeddingDraft {
  return {
    ...draft,
    draftId: draft.draftId || createPlatformDraftId(),
    contentBrief: getWeddingContentBrief(draft),
    templateContent: getWeddingTemplateContent(draft),
    deliveryScope: getWeddingDeliveryScope(draft),
    dataPolicy: normalizePlatformDataPolicy(draft.dataPolicy),
  };
}

export function createDefaultDraft(plan: PlatformPlanId = 'buyout'): WeddingDraft {
  return {
    draftId: createPlatformDraftId(),
    partnerOne: '',
    partnerTwo: '',
    weddingDate: '',
    location: '',
    guestCount: '80',
    theme: 'estate',
    tone: 'romantic',
    plan,
    modules: [...DEFAULT_MODULES],
    storyNote: '',
    contentBrief: { ...DEFAULT_PLATFORM_CONTENT_BRIEF },
    templateContent: {
      ...DEFAULT_PLATFORM_TEMPLATE_CONTENT,
      quizQuestions: [],
      quickQuizQuestions: DEFAULT_PLATFORM_TEMPLATE_CONTENT.quickQuizQuestions.map((question) => ({ ...question })),
      charadesWords: [...DEFAULT_PLATFORM_TEMPLATE_CONTENT.charadesWords],
      missionCopyOverrides: [],
    },
    deliveryScope: {
      ...DEFAULT_PLATFORM_DELIVERY_SCOPE,
      services: [...DEFAULT_PLATFORM_DELIVERY_SCOPE.services],
    },
    dataPolicy: { ...DEFAULT_PLATFORM_DATA_POLICY },
  };
}

export function isWeddingDraft(value: unknown): value is WeddingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<WeddingDraft>;
  const themeIds = new Set(PLATFORM_THEMES.map((theme) => theme.id));
  const toneIds = new Set(PLATFORM_TONES.map((tone) => tone.id));
  const planIds = new Set(PLATFORM_PLANS.map((plan) => plan.id));
  const moduleIds = new Set(PLATFORM_MODULES.map((module) => module.id));

  return (
    (draft.draftId === undefined || typeof draft.draftId === 'string') &&
    typeof draft.partnerOne === 'string' &&
    typeof draft.partnerTwo === 'string' &&
    typeof draft.weddingDate === 'string' &&
    typeof draft.location === 'string' &&
    typeof draft.storyNote === 'string' &&
    (draft.contentBrief === undefined || isPlatformContentBrief(draft.contentBrief)) &&
    (draft.templateContent === undefined || isPlatformTemplateContent(draft.templateContent)) &&
    (draft.deliveryScope === undefined || isPlatformDeliveryScope(draft.deliveryScope)) &&
    (draft.dataPolicy === undefined || isPlatformDataPolicy(draft.dataPolicy)) &&
    ['40', '80', '120', '180'].includes(draft.guestCount ?? '') &&
    themeIds.has(draft.theme as PlatformThemeId) &&
    toneIds.has(draft.tone as PlatformToneId) &&
    planIds.has(draft.plan as PlatformPlanId) &&
    Array.isArray(draft.modules) &&
    draft.modules.every((module) => moduleIds.has(module))
  );
}

export function formatWeddingDate(date: string) {
  if (!date) return '婚礼日期待定';
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.valueOf())) return '婚礼日期待定';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed);
}

export function getWeddingCoupleName(draft: WeddingDraft) {
  return [draft.partnerOne.trim(), draft.partnerTwo.trim()].filter(Boolean).join(' & ') || '你们的名字';
}

export function renderPlatformTemplateText(template: string, draft: WeddingDraft) {
  const values: Record<(typeof PLATFORM_TEMPLATE_VARIABLES)[number], string> = {
    partnerOne: draft.partnerOne.trim() || '第一位新人',
    partnerTwo: draft.partnerTwo.trim() || '第二位新人',
    couple: getWeddingCoupleName(draft),
    location: draft.location.trim() || '婚礼现场',
    weddingDate: formatWeddingDate(draft.weddingDate),
  };
  return template.replace(/{{(partnerOne|partnerTwo|couple|location|weddingDate)}}/g, (_match, key: keyof typeof values) => values[key]);
}

export function buildWeddingBrief(draft: WeddingDraft) {
  const selectedTheme = PLATFORM_THEMES.find((theme) => theme.id === draft.theme) ?? PLATFORM_THEMES[0];
  const selectedTone = PLATFORM_TONES.find((tone) => tone.id === draft.tone) ?? PLATFORM_TONES[0];
  const selectedPlan = PLATFORM_PLANS.find((plan) => plan.id === draft.plan) ?? PLATFORM_PLANS[0];
  const selectedModules = PLATFORM_MODULES.filter((module) => draft.modules.includes(module.id));
  const content = getWeddingContentBrief(draft);
  const templateContent = getWeddingTemplateContent(draft);
  const deliveryScope = getWeddingDeliveryScope(draft);
  const dataPolicy = normalizePlatformDataPolicy(draft.dataPolicy);
  const language = content.language === 'bilingual' ? '中英双语' : '中文';
  const interaction = { gentle: '轻松温和', balanced: '自然平衡', immersive: '高沉浸互动' }[content.interaction];
  const guestMix = { family: '家人与长辈为主', balanced: '亲友较均衡', friends: '朋友为主' }[content.guestMix];
  const customizationLevel = PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === deliveryScope.customizationLevel)?.name ?? '协作定制';
  const supportMode = PLATFORM_SUPPORT_MODES.find((item) => item.id === deliveryScope.supportMode)?.name ?? '远程协助';
  const rehearsalMode = PLATFORM_REHEARSAL_MODES.find((item) => item.id === deliveryScope.rehearsalMode)?.name ?? '完整彩排';
  const services = PLATFORM_SERVICES.filter((item) => deliveryScope.services.includes(item.id));

  return [
    '婚礼游戏工坊 · 项目需求单',
    `模板：${FLAGSHIP_TEMPLATE.name} · ${FLAGSHIP_TEMPLATE.version}`,
    `婚礼游戏方案：${getWeddingCoupleName(draft)}`,
    `日期：${formatWeddingDate(draft.weddingDate)}`,
    `地点：${draft.location.trim() || '待定'}`,
    `宾客规模：约 ${draft.guestCount} 人`,
    `视觉：${selectedTheme.name}`,
    `叙事：${selectedTone.name}`,
    `方案：${selectedPlan.name}`,
    `定制深度：${customizationLevel}`,
    `运营支持：${supportMode}`,
    `彩排方式：${rehearsalMode}`,
    `服务范围：${services.map((item) => item.name).join('、') || '尚未选择'}`,
    `宾客运行资料保留：婚礼后 ${dataPolicy.retentionWindow === 'event_plus_90_days' ? 90 : dataPolicy.retentionWindow === 'event_plus_30_days' ? 30 : 7} 天`,
    dataPolicy.projectArchiveBeforeDeletion ? '删除前导出不含宾客运行资料的项目配置归档' : '删除前不生成项目配置归档',
    dataPolicy.rosterAuthorityConfirmed ? '名单提供权限已确认' : '名单提供权限尚未确认',
    dataPolicy.guestNoticeConfirmed ? '宾客告知责任已确认' : '宾客告知责任尚未确认',
    deliveryScope.serviceNotes.trim() ? `服务备注：${deliveryScope.serviceNotes.trim()}` : '',
    `模块：${selectedModules.map((module) => module.name).join('、') || '尚未选择'}`,
    draft.storyNote.trim() ? `故事备注：${draft.storyNote.trim()}` : '',
    `内容语言：${language}`,
    `互动强度：${interaction}`,
    `宾客构成：${guestMix}`,
    content.storyMoments.trim() ? `故事素材：${content.storyMoments.trim()}` : '',
    content.avoidTopics.trim() ? `内容边界：${content.avoidTopics.trim()}` : '',
    content.boundariesConfirmed ? '内容边界已由客户确认' : '内容边界尚未确认',
    content.hostNotes.trim() ? `主持备注：${content.hostNotes.trim()}` : '',
    `团队名称：${templateContent.teamOneName} / ${templateContent.teamTwoName}`,
    `开场口播：${templateContent.openingScript}`,
    templateContent.quizQuestions.length ? `新人问答：${templateContent.quizQuestions.length} 题` : '新人问答：尚未添加',
    `快问快答：${templateContent.quickQuizQuestions.length} 题`,
    `你比划我猜：${templateContent.charadesWords.length} 个词`,
    `任务文案覆盖：${templateContent.missionCopyOverrides.length} 项（积分、核验与分配规则保持锁定）`,
    '',
    '说明：此文件是第一版需求摘要，不代表最终报价、合同或交付承诺。',
  ].filter(Boolean).join('\n');
}
