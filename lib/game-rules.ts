export const GAME_STAGES = ['registration', 'waiting', 'task_round_1', 'task_round_2', 'group_game', 'voting', 'results'] as const;
export const MANUAL_GAME_STAGES = ['registration', 'waiting', 'task_round_1', 'task_round_2', 'group_game'] as const;
export const TASK_STAGES = ['task_round_1', 'task_round_2', 'group_game'] as const;
export const GAME_ROLES = ['guest', 'spy'] as const;
export const PARTICIPATION_MODES = ['ACTIVE_PLAYER', 'HONOR_GUEST', 'PRINCIPAL'] as const;
export const STORY_ROLES = ['NONE', 'OFFICIANT', 'RING_KEEPER', 'GROOM_CHEERLEADER', 'BRIDE_CHEERLEADER', 'APPLAUSE_STARTER', 'HEART_HOLDER', 'STAR_HOLDER'] as const;
export const ROLE_SCOPES = ['all', ...GAME_ROLES] as const;
export const TASK_CATEGORIES = ['standard', 'ceremony', 'group', 'upgrade', 'hidden'] as const;
export const PLAYER_RELATIONSHIP_TYPES = ['CUPID_ALLIANCE', 'STAR_ALLIANCE', 'TRICKSTER_CONNECTION'] as const;
export const CEREMONY_STATUSES = ['LOCKED', 'AVAILABLE', 'BRIEFED', 'RING_RECEIVED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'] as const;
export const RING_VARIANTS = ['GROOM_RING', 'BRIDE_RING'] as const;

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
  const required = STAGE_ORDER[taskStage ?? ''];
  const current = STAGE_ORDER[gameStage ?? ''];
  if (required === undefined || current === undefined) return false;
  return required <= current;
}

export function isAssignmentVisibleAtStage(input: {
  taskStage: string | null | undefined;
  gameStage: string | null | undefined;
  isInitial: boolean;
  missionCode: string | null | undefined;
}): boolean {
  const waitingForFirstRound = input.taskStage === 'task_round_1'
    && ['registration', 'waiting'].includes(input.gameStage ?? '')
    && (input.isInitial || input.missionCode === 'P1-TRICKSTER-001');
  return waitingForFirstRound || isTaskVisibleAtStage(input.taskStage, input.gameStage);
}

export function isTaskWaitingForStage(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  const required = STAGE_ORDER[taskStage ?? ''];
  const current = STAGE_ORDER[gameStage ?? ''];
  if (required === undefined || current === undefined) return false;
  return required > current;
}

export function isPhaseOneInteractionOpenAtStage(gameStage: string | null | undefined): boolean {
  return ['registration', 'waiting', 'task_round_2', 'group_game'].includes(gameStage ?? '');
}

export function isTaskPausedDuringCeremony(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  return taskStage === 'task_round_1' && gameStage === 'task_round_1';
}

export function isTaskActionOpenAtStage(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  if (taskStage === 'task_round_1') return isPhaseOneInteractionOpenAtStage(gameStage);
  if (taskStage === 'task_round_2') return ['task_round_2', 'group_game'].includes(gameStage ?? '');
  if (taskStage === 'group_game') return gameStage === 'group_game';
  return false;
}
