import { isTaskActionOpenAtStage } from './game-rules.ts';

export type ManualTaskGuest = {
  id: string;
  active: boolean;
  uses_app: boolean;
  participation_mode: string;
  eligible_for_mission: boolean;
  drawn_at: string | null;
  role: string;
  story_role: string;
};

export type ManualTaskCandidate = {
  id: string;
  active: boolean;
  is_demo: boolean;
  formal_allowed: boolean;
  mission_code: string | null;
  category: string;
  role_scope: string;
  story_role_scope: string;
  stage: string;
  max_assignments: number | null;
};

export type ManualTaskAssignment = {
  id: string;
  guest_id: string;
  task_id: string;
  status: string;
};

export type ManualTaskEligibilityCode =
  | 'catalog_not_demo'
  | 'guest_inactive'
  | 'guest_no_app'
  | 'guest_not_active_player'
  | 'guest_mission_ineligible'
  | 'guest_not_drawn'
  | 'task_inactive'
  | 'task_not_demo'
  | 'task_formal'
  | 'task_hidden'
  | 'role_mismatch'
  | 'story_role_mismatch'
  | 'stage_closed'
  | 'already_assigned'
  | 'capacity_full'
  | 'eligible';

export type ManualTaskEligibility = {
  eligible: boolean;
  code: ManualTaskEligibilityCode;
  reason: string;
};

type ManualTaskEligibilityInput = {
  guest: ManualTaskGuest;
  task: ManualTaskCandidate;
  taskCatalogMode: string | null | undefined;
  gameStage: string | null | undefined;
  assignments: readonly ManualTaskAssignment[];
  excludeAssignmentId?: string | null;
};

const RESULT_COPY: Record<ManualTaskEligibilityCode, string> = {
  catalog_not_demo: '当前是正式婚礼模式，不开放人工派发演示任务。',
  guest_inactive: '这位宾客已停用，不能领取任务。',
  guest_no_app: '这位宾客没有软件账号，不能领取演示任务。',
  guest_not_active_player: '这位宾客不是任务玩家，不能领取演示任务。',
  guest_mission_ineligible: '这位宾客当前不参与任务。',
  guest_not_drawn: '这位宾客还没有完成抽卡，抽卡后才能领取演示任务。',
  task_inactive: '这项演示任务没有启用。',
  task_not_demo: '这项任务不属于演示任务池。',
  task_formal: '正式婚礼任务只能由抽卡或流程自动派发。',
  task_hidden: '隐藏任务不能通过手动任务入口派发。',
  role_mismatch: '当前演示任务不适用于这位宾客的秘密身份。',
  story_role_mismatch: '当前演示任务不适用于这位宾客的剧情身份。',
  stage_closed: '当前婚礼环节没有可派发的演示任务。',
  already_assigned: '这位宾客已经领取过当前可用的演示任务。',
  capacity_full: '符合条件的演示任务名额已经派完。',
  eligible: '',
};

function result(code: ManualTaskEligibilityCode): ManualTaskEligibility {
  return { eligible: code === 'eligible', code, reason: RESULT_COPY[code] };
}

export function countActiveManualTaskAssignments(
  assignments: readonly ManualTaskAssignment[],
  taskId: string,
  excludeAssignmentId?: string | null,
): number {
  return assignments.filter((assignment) => assignment.task_id === taskId
    && assignment.status !== 'cancelled'
    && assignment.id !== excludeAssignmentId).length;
}

export function evaluateManualTaskEligibility(input: ManualTaskEligibilityInput): ManualTaskEligibility {
  const { guest, task } = input;
  if (input.taskCatalogMode !== 'demo') return result('catalog_not_demo');
  if (!guest.active) return result('guest_inactive');
  if (!guest.uses_app) return result('guest_no_app');
  if (guest.participation_mode !== 'ACTIVE_PLAYER') return result('guest_not_active_player');
  if (!guest.eligible_for_mission) return result('guest_mission_ineligible');
  if (!guest.drawn_at) return result('guest_not_drawn');
  if (!task.active) return result('task_inactive');
  if (!task.is_demo) return result('task_not_demo');
  if (task.mission_code !== null || task.formal_allowed || /^P[12]-/i.test(task.mission_code ?? '')) {
    return result('task_formal');
  }
  if (task.category === 'hidden') return result('task_hidden');
  if (!['all', guest.role].includes(task.role_scope)) return result('role_mismatch');
  if (!['NONE', guest.story_role].includes(task.story_role_scope)) return result('story_role_mismatch');
  if (!isTaskActionOpenAtStage(task.stage, input.gameStage)) return result('stage_closed');
  // The database's permanent guest/task uniqueness also covers cancelled
  // history. Do not offer a choice that the authoritative insert will reject.
  if (input.assignments.some((assignment) => assignment.guest_id === guest.id && assignment.task_id === task.id)) {
    return result('already_assigned');
  }
  if (task.max_assignments !== null
      && countActiveManualTaskAssignments(input.assignments, task.id, input.excludeAssignmentId) >= task.max_assignments) {
    return result('capacity_full');
  }
  return result('eligible');
}

export function getManualTaskAvailability<T extends ManualTaskCandidate>(input: Omit<ManualTaskEligibilityInput, 'task'> & {
  tasks: readonly T[];
}): { tasks: T[]; reason: string } {
  const results = input.tasks.map((task) => ({
    task,
    result: evaluateManualTaskEligibility({ ...input, task }),
  }));
  const tasks = results.filter((item) => item.result.eligible).map((item) => item.task);
  if (tasks.length) return { tasks, reason: '' };

  const guestOrModeFailure = results.find((item) => [
    'catalog_not_demo', 'guest_inactive', 'guest_no_app', 'guest_not_active_player',
    'guest_mission_ineligible', 'guest_not_drawn',
  ].includes(item.result.code));
  if (guestOrModeFailure) return { tasks, reason: guestOrModeFailure.result.reason };
  if (!results.length) return { tasks, reason: '当前没有已启用的演示任务，请先在婚礼设置中创建并启用。' };

  // Report the furthest eligibility gate reached. This gives the operator the
  // next concrete action instead of a generic database error after clicking.
  for (const codes of [
    ['already_assigned'],
    ['capacity_full'],
    ['stage_closed'],
    ['role_mismatch', 'story_role_mismatch'],
    ['task_inactive', 'task_not_demo', 'task_formal', 'task_hidden'],
  ] as ManualTaskEligibilityCode[][]) {
    const matching = results.find((item) => codes.includes(item.result.code));
    if (matching) return { tasks, reason: matching.result.reason };
  }
  return { tasks, reason: '当前没有适合这位宾客的演示任务。' };
}
