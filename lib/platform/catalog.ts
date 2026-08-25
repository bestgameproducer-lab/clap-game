export type PlatformPlanId = 'buyout' | 'subscription';
export type PlatformThemeId = 'estate' | 'garden' | 'night';
export type PlatformToneId = 'romantic' | 'social' | 'mystery';
export type PlatformModuleId =
  | 'secret-missions'
  | 'team-games'
  | 'host-toolkit'
  | 'live-scoreboard'
  | 'finale-vote';
export type PlatformCustomizationLevelId = 'template' | 'guided' | 'bespoke';
export type PlatformSupportModeId = 'self_service' | 'remote_guided' | 'managed';
export type PlatformRehearsalModeId = 'self_check' | 'remote_walkthrough' | 'full_rehearsal';
export type PlatformServiceId =
  | 'brand-adaptation'
  | 'content-workshop'
  | 'guest-import'
  | 'host-runbook'
  | 'wedding-day-support'
  | 'archive-export';

export type PlatformPlan = {
  id: PlatformPlanId;
  eyebrow: string;
  name: string;
  summary: string;
  bestFor: string;
  includes: readonly string[];
};

export type PlatformTheme = {
  id: PlatformThemeId;
  name: string;
  description: string;
  palette: readonly [string, string, string];
};

export type PlatformModule = {
  id: PlatformModuleId;
  name: string;
  shortName: string;
  description: string;
  stage: string;
};

export type PlatformScopeOption<T extends string> = {
  id: T;
  name: string;
  description: string;
};

export type PlatformService = PlatformScopeOption<PlatformServiceId> & {
  availability: 'standard' | 'needs-confirmation';
};

export const PLATFORM_PLANS: readonly PlatformPlan[] = [
  {
    id: 'buyout',
    eyebrow: 'ONE WEDDING · ONE DELIVERY',
    name: '单场买断',
    summary: '围绕一场婚礼完成定制、彩排与交付，婚礼结束后按约定导出资料。',
    bestFor: '适合只办一场、希望一次确定预算的新人',
    includes: ['一套独立婚礼实例', '品牌与玩法定制', '上线前完整彩排', '婚礼日操作手册'],
  },
  {
    id: 'subscription',
    eyebrow: 'MANAGED · ALWAYS CURRENT',
    name: '持续订阅',
    summary: '由平台持续托管，保留方案、嘉宾名单与运营工具，并获得后续模板更新。',
    bestFor: '适合婚礼策划师、场地与需要反复复用的团队',
    includes: ['持续托管与安全更新', '多次彩排与版本记录', '模板库持续升级', '婚礼项目工作台'],
  },
] as const;

export const PLATFORM_THEMES: readonly PlatformTheme[] = [
  {
    id: 'estate',
    name: '南洋庄园',
    description: '奶油纸张、深可可与复古金，适合目的地与晚宴婚礼。',
    palette: ['#f4ead8', '#6d3f32', '#c99455'],
  },
  {
    id: 'garden',
    name: '花园誓言',
    description: '雾粉、鼠尾草绿与暖白，轻盈、浪漫且适合白天仪式。',
    palette: ['#f7eee8', '#6f806d', '#c78378'],
  },
  {
    id: 'night',
    name: '午夜剧场',
    description: '墨蓝、香槟金与烛光红，适合派对感更强的夜间婚礼。',
    palette: ['#18223a', '#c8a15f', '#8f3f48'],
  },
] as const;

export const PLATFORM_TONES: readonly {
  id: PlatformToneId;
  name: string;
  description: string;
}[] = [
  { id: 'romantic', name: '浪漫叙事', description: '让任务围绕新人故事、回忆与祝福展开。' },
  { id: 'social', name: '轻松破冰', description: '降低角色压力，让陌生宾客自然认识彼此。' },
  { id: 'mystery', name: '沉浸悬疑', description: '保留隐藏身份、阵营判断和最终揭晓张力。' },
] as const;

export const PLATFORM_MODULES: readonly PlatformModule[] = [
  {
    id: 'secret-missions',
    name: '宾客秘密任务',
    shortName: '秘密任务',
    description: '扫码领取身份、私密任务、证据提交与工作人员审核。',
    stage: '签到至晚宴',
  },
  {
    id: 'team-games',
    name: '团队互动游戏',
    shortName: '团队游戏',
    description: '分组、现场小游戏、团队积分与主持人快速控场。',
    stage: '晚宴互动',
  },
  {
    id: 'host-toolkit',
    name: '主持人游戏台',
    shortName: '主持人台',
    description: '题库、计时、随机数、流程提示与现场应急操作。',
    stage: '全流程',
  },
  {
    id: 'live-scoreboard',
    name: '实时积分大屏',
    shortName: '积分大屏',
    description: '适合投影展示的团队榜、个人榜与公开线索。',
    stage: '晚宴互动',
  },
  {
    id: 'finale-vote',
    name: '终局投票揭晓',
    shortName: '终局揭晓',
    description: '宾客投票、身份结算、最终排名与颁奖时刻。',
    stage: '派对终章',
  },
] as const;

export const PLATFORM_CUSTOMIZATION_LEVELS: readonly PlatformScopeOption<PlatformCustomizationLevelId>[] = [
  { id: 'template', name: '模板自助', description: '保留旗舰玩法结构，自行填写姓名、题库、组名和视觉方向。' },
  { id: 'guided', name: '协作定制', description: '平台协助梳理故事、互动边界和主持内容，再共同确认成稿。' },
  { id: 'bespoke', name: '深度定制', description: '在旗舰结构上重新设计内容与视觉；范围和周期需要人工评估。' },
] as const;

export const PLATFORM_SUPPORT_MODES: readonly PlatformScopeOption<PlatformSupportModeId>[] = [
  { id: 'self_service', name: '自助运营', description: '客户团队按操作手册自行配置、彩排和现场控制。' },
  { id: 'remote_guided', name: '远程协助', description: '平台在关键节点远程协助检查配置、彩排与发布准备。' },
  { id: 'managed', name: '托管协作', description: '平台参与内容整理和流程准备；婚礼日支持能力需另行确认。' },
] as const;

export const PLATFORM_REHEARSAL_MODES: readonly PlatformScopeOption<PlatformRehearsalModeId>[] = [
  { id: 'self_check', name: '自助检查', description: '使用检查表和预览完成内部核验。' },
  { id: 'remote_walkthrough', name: '远程走台', description: '安排一次远程流程讲解，逐项确认关键操作。' },
  { id: 'full_rehearsal', name: '完整彩排', description: '按角色、阶段和异常路径完成一次正式环境彩排。' },
] as const;

export const PLATFORM_SERVICES: readonly PlatformService[] = [
  { id: 'brand-adaptation', name: '品牌与视觉适配', description: '调整配色、文案语气与基础品牌元素。', availability: 'standard' },
  { id: 'content-workshop', name: '故事与题库工作坊', description: '共同整理新人故事、题库和互动边界。', availability: 'standard' },
  { id: 'guest-import', name: '宾客名单导入', description: '按安全模板整理并导入宾客基础资料。', availability: 'standard' },
  { id: 'host-runbook', name: '主持人流程手册', description: '生成主持话术、游戏顺序和应急处理说明。', availability: 'standard' },
  { id: 'wedding-day-support', name: '婚礼日远程支持', description: '婚礼时段的远程协助需要确认日期、时区和服务能力。', availability: 'needs-confirmation' },
  { id: 'archive-export', name: '婚礼后资料归档', description: '按约定导出项目配置与可交付资料。', availability: 'standard' },
] as const;

export const FLAGSHIP_TEMPLATE = {
  id: 'cupid-wedding-trial',
  version: '2026.08',
  name: '丘比特的婚礼考验',
  promise: '把签到、仪式与晚宴串成一场有秘密、有合作、也有最终揭晓的婚礼游戏。',
  provenSurfaces: ['宾客端', '主办方台', '主持人台', '任务核验站', '投影大屏'],
} as const;
