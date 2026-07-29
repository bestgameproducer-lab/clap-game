export const GAME_STAGES = ['registration', 'waiting', 'task_round_1', 'task_round_2', 'group_game', 'voting', 'results'] as const;
export const TASK_STAGES = ['task_round_1', 'task_round_2', 'group_game'] as const;
export const GAME_ROLES = ['guest', 'spy', 'helper'] as const;
export const ROLE_SCOPES = ['all', ...GAME_ROLES] as const;
export const TASK_CATEGORIES = ['standard', 'ceremony', 'group', 'upgrade', 'hidden'] as const;

const STAGE_ORDER: Record<string, number> = {
  registration: 0,
  waiting: 0,
  task_round_1: 1,
  task_round_2: 2,
  group_game: 3,
  voting: 4,
  results: 5,
};

export function isTaskVisibleAtStage(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  const required = STAGE_ORDER[taskStage ?? 'task_round_1'] ?? 1;
  const current = STAGE_ORDER[gameStage ?? 'registration'] ?? 0;
  return required <= current;
}
