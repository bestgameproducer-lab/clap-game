export const GAME_STAGES = ['registration', 'waiting', 'task_round_1', 'ceremony_end', 'task_round_2', 'banquet', 'group_game', 'voting', 'results'] as const;
export const MANUAL_GAME_STAGES = ['registration', 'waiting', 'task_round_1', 'ceremony_end', 'task_round_2', 'banquet', 'group_game'] as const;
export const TASK_STAGES = ['task_round_1', 'task_round_2', 'group_game'] as const;
export const GAME_ROLES = ['guest', 'spy'] as const;
export const PARTICIPATION_MODES = ['ACTIVE_PLAYER', 'HONOR_GUEST', 'PRINCIPAL'] as const;
export const STORY_ROLES = ['NONE', 'OFFICIANT', 'RING_KEEPER', 'GROOM_CHEERLEADER', 'BRIDE_CHEERLEADER', 'HEART_HOLDER', 'STAR_HOLDER'] as const;
export const PHASE_TWO_PRIMARY_MISSIONS = [
  'TOAST_GROOM_FATHER', 'TOAST_BRIDE_MOTHER', 'INTERACT_WITH_GROOM', 'INTERACT_WITH_BRIDE',
  'DINNER_SPEECH', 'HEART_DILEMMA', 'STAR_DILEMMA', 'COPY_SCORE', 'TEAM_CAPTAIN', 'TRICKSTER',
  'EXTRA_VOTE', 'SUPER_LUCKY',
] as const;
export const ROLE_SCOPES = ['all', ...GAME_ROLES] as const;
export const TASK_CATEGORIES = ['standard', 'ceremony', 'group', 'upgrade', 'hidden'] as const;
export const PLAYER_RELATIONSHIP_TYPES = ['CUPID_ALLIANCE', 'STAR_ALLIANCE', 'TRICKSTER_CONNECTION'] as const;
export const CEREMONY_STATUSES = ['LOCKED', 'AVAILABLE', 'BRIEFED', 'RING_RECEIVED', 'IN_PROGRESS', 'DELIVERED', 'COMPLETED'] as const;
export const RING_VARIANTS = ['GROOM_RING', 'BRIDE_RING'] as const;

const STAGE_ORDER: Record<string, number> = {
  registration: 0,
  waiting: 0,
  task_round_1: 1,
  ceremony_end: 1,
  task_round_2: 2,
  banquet: 2,
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
  return ['registration', 'waiting', 'ceremony_end', 'task_round_2', 'banquet', 'group_game'].includes(gameStage ?? '');
}

export function isTaskPausedDuringCeremony(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  return taskStage === 'task_round_1' && gameStage === 'task_round_1';
}

export function isTaskActionOpenAtStage(taskStage: string | null | undefined, gameStage: string | null | undefined): boolean {
  if (taskStage === 'task_round_1') return isPhaseOneInteractionOpenAtStage(gameStage);
  if (taskStage === 'task_round_2') return ['task_round_2', 'banquet', 'group_game'].includes(gameStage ?? '');
  if (taskStage === 'group_game') return gameStage === 'group_game';
  return false;
}

export function taskActionClosedMessage(
  taskStage: string | null | undefined,
  action: '提交' | '照片上传' = '提交',
) {
  if (taskStage === 'task_round_1') {
    return `当前环节暂停或已关闭${action}；第一轮在宾客签到、等待仪式，以及仪式结束后至团队挑战期间开放`;
  }
  if (taskStage === 'task_round_2') {
    return `当前环节尚未开放或已关闭${action}；第二轮只在婚宴前奏、婚宴和团队挑战期间开放`;
  }
  if (taskStage === 'group_game') {
    return `当前环节尚未开放或已关闭${action}；团队任务只在团队挑战期间开放`;
  }
  return `当前婚礼环节不允许${action}，请刷新页面或联系现场工作人员`;
}

export function phaseOneInteractionClosedMessage(action: '配对' | '伙伴确认' | '好友确认') {
  return `当前环节暂停或已关闭${action}；仪式前与仪式结束后至最终投票前开放`;
}
