export const GAME_STAGES = {
  registration: {
    label: '婚礼入场 · 宾客签到',
    note: '欢迎来到婚礼现场。完成签到并抽取你的专属卡片，记得独自查看，不要向任何人透露身份。',
  },
  waiting: {
    label: '婚礼序章 · 等待仪式',
    note: '婚礼即将开始。请先入座、熟悉现场，并保管好自己的身份与任务。',
  },
  task_round_1: {
    label: '婚礼仪式 · 丘比特的秘密来宾',
    note: '婚礼仪式正在进行。请专心见证仪式，任务提交和配对将在仪式结束后恢复。',
  },
  ceremony_end: {
    label: '仪式结束 · 第一阶段恢复',
    note: '婚礼仪式已经结束，第一阶段任务提交和伙伴配对现已恢复。第二阶段任务尚未开放。',
  },
  task_round_2: {
    label: '婚宴前奏 · 第二阶段开启',
    note: '丘比特的晚宴考验已经开启。查看你的新任务，并在婚宴期间留意团队与伙伴动态。',
  },
  group_game: {
    label: '婚宴互动 · 团队挑战',
    note: '团队挑战正在进行。和队友合作完成公开活动，同时继续观察可疑行为。',
  },
  voting: {
    label: '婚礼终章 · 最终投票',
    note: '最终投票已经开放。根据你观察到的行为，选出本队最可疑的恶作剧者。',
  },
  results: {
    label: '婚礼终章 · 身份揭晓',
    note: '所有身份即将揭晓。请和主持人一起见证最终结果与婚礼荣誉。',
  },
} as const;

export type GameStage = keyof typeof GAME_STAGES;

export const GAME_STAGE_OPTIONS = (Object.keys(GAME_STAGES) as GameStage[]).map(
  (value) => [value, GAME_STAGES[value].label] as const,
);

export function gameStageCopy(stage: string | null | undefined) {
  return GAME_STAGES[stage as GameStage] ?? GAME_STAGES.registration;
}
