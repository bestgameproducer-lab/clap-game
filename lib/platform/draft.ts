import {
  FLAGSHIP_TEMPLATE,
  PLATFORM_MODULES,
  PLATFORM_PLANS,
  PLATFORM_THEMES,
  PLATFORM_TONES,
  type PlatformModuleId,
  type PlatformPlanId,
  type PlatformThemeId,
  type PlatformToneId,
} from './catalog';

export const PLATFORM_DRAFT_STORAGE_KEY = 'wedding-play-studio-draft-v1';

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

export function ensureWeddingDraftId(draft: WeddingDraft): WeddingDraft {
  return draft.draftId ? draft : { ...draft, draftId: createPlatformDraftId() };
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

export function buildWeddingBrief(draft: WeddingDraft) {
  const selectedTheme = PLATFORM_THEMES.find((theme) => theme.id === draft.theme) ?? PLATFORM_THEMES[0];
  const selectedTone = PLATFORM_TONES.find((tone) => tone.id === draft.tone) ?? PLATFORM_TONES[0];
  const selectedPlan = PLATFORM_PLANS.find((plan) => plan.id === draft.plan) ?? PLATFORM_PLANS[0];
  const selectedModules = PLATFORM_MODULES.filter((module) => draft.modules.includes(module.id));

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
    `模块：${selectedModules.map((module) => module.name).join('、') || '尚未选择'}`,
    draft.storyNote.trim() ? `故事备注：${draft.storyNote.trim()}` : '',
    '',
    '说明：此文件是第一版需求摘要，不代表最终报价、合同或交付承诺。',
  ].filter(Boolean).join('\n');
}
