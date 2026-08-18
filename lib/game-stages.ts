export const GAME_STAGES = {
  registration: {
    title: '宾客签到',
    roundLabel: '第一轮任务领取',
    label: '宾客签到 · 第一轮任务领取',
    note: '欢迎来到婚礼现场。完成签到并抽取你的专属卡片，记得独自查看，不要向任何人透露身份。',
  },
  waiting: {
    title: '等待仪式',
    roundLabel: '第一轮任务进行中',
    label: '等待仪式 · 第一轮任务进行中',
    note: '婚礼即将开始。请先入座、熟悉现场，并保管好自己的身份与任务。',
  },
  task_round_1: {
    title: '婚礼仪式',
    roundLabel: '第一轮任务暂停',
    label: '婚礼仪式 · 第一轮任务暂停',
    note: '婚礼仪式正在进行。请专心见证仪式，任务提交和配对将在仪式结束后恢复。',
  },
  ceremony_end: {
    title: '仪式结束',
    roundLabel: '第一轮任务恢复',
    label: '仪式结束 · 第一轮任务恢复',
    note: '婚礼仪式已经结束，第一轮任务提交和伙伴配对现已恢复。第二轮任务尚未发放。',
  },
  task_round_2: {
    title: '婚宴前奏',
    roundLabel: '第二轮任务发放',
    label: '婚宴前奏 · 第二轮任务发放',
    note: '丘比特的晚宴考验已经开启。请独自查看新获得的第二轮任务，并按现场节奏开始行动；婚宴开始后仍可继续。',
  },
  banquet: {
    title: '婚宴开始',
    roundLabel: '第二轮任务进行中',
    label: '婚宴开始 · 第二轮任务进行中',
    note: '婚宴已经开始。请享用晚宴，并在不打扰宾客用餐的前提下完成第二轮秘密任务。',
  },
  group_game: {
    title: '婚宴互动',
    roundLabel: '团队挑战',
    label: '婚宴互动 · 团队挑战',
    note: '团队挑战正在进行。和队友合作完成公开活动，同时继续观察可疑行为。',
  },
  voting: {
    title: '最终投票',
    roundLabel: '恶作剧者指认',
    label: '最终投票 · 恶作剧者指认',
    note: '最终投票已经开放。根据你观察到的行为，选出本队最可疑的恶作剧者。',
  },
  results: {
    title: '身份揭晓与颁奖',
    roundLabel: '终局个人奖励结算',
    label: '身份揭晓与颁奖 · 终局个人奖励结算',
    note: '恶作剧者与投票结果即将揭晓；团队挑战分保持锁定。抓住后投中者 +2、其他已投票者 +1；逃脱队伍不加投票分。',
  },
} as const;

export type GameStage = keyof typeof GAME_STAGES;

export const LIVE_GAME_STAGE_SEQUENCE = [
  'registration',
  'waiting',
  'task_round_1',
  'ceremony_end',
  'task_round_2',
  'banquet',
  'group_game',
] as const satisfies readonly GameStage[];

export function nextLiveGameStage(stage: string | null | undefined): GameStage | null {
  const index = LIVE_GAME_STAGE_SEQUENCE.indexOf(stage as typeof LIVE_GAME_STAGE_SEQUENCE[number]);
  return index >= 0 ? LIVE_GAME_STAGE_SEQUENCE[index + 1] ?? null : null;
}

export function isNextLiveGameStage(current: string | null | undefined, requested: string): boolean {
  return nextLiveGameStage(current) === requested;
}

export const GAME_STAGE_OPTIONS = (Object.keys(GAME_STAGES) as GameStage[]).map(
  (value) => [value, GAME_STAGES[value].label] as const,
);

export function gameStageCopy(stage: string | null | undefined) {
  return GAME_STAGES[stage as GameStage] ?? GAME_STAGES.registration;
}
