export type PlatformPlanId = 'buyout' | 'subscription';
export type PlatformThemeId = 'estate' | 'garden' | 'night';
export type PlatformToneId = 'romantic' | 'social' | 'mystery';
export type PlatformModuleId =
  | 'secret-missions'
  | 'team-games'
  | 'host-toolkit'
  | 'live-scoreboard'
  | 'finale-vote';

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

export const FLAGSHIP_TEMPLATE = {
  id: 'cupid-wedding-trial',
  version: '2026.08',
  name: '丘比特的婚礼考验',
  promise: '把签到、仪式与晚宴串成一场有秘密、有合作、也有最终揭晓的婚礼游戏。',
  provenSurfaces: ['宾客端', '主办方台', '主持人台', '任务核验站', '投影大屏'],
} as const;
