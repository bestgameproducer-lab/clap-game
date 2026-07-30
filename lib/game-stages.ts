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
    note: '第一阶段已经开始。请在不影响婚礼仪式的前提下悄悄完成任务，并始终保密你的身份。',
  },
  task_round_2: {
    label: '仪式结束 · 社交解锁',
    note: '婚礼仪式已经结束，新的角色与社交任务现已开放。留意手机中的新内容。',
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
