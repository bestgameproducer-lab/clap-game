import { requireAdmin } from '@/lib/auth';
import {
  adjustGuestPoints,
  adjustTeamPoints,
  approveAssignment,
  completeAssignmentAtStation,
  assignTaskToGuest,
  configureGuestGameProfile,
  saveGameClue,
  saveGameTask,
  saveGuestRoster,
  importGuestRoster,
  grantClueToGuest,
  issueHiddenTaskCode,
  redeemHiddenTaskCode,
  recordSpyPointEvent,
  resetRehearsalData,
  rejectAssignment,
  resetGuestClaim,
  setGameFlag,
  setGameStage,
  setLiveDisplay,
  setInvitationCode,
  setGuestPhaseNote,
  setRegistrationOpen,
  saveAward,
} from '@/lib/data/admin';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { GAME_ROLES, MANUAL_GAME_STAGES, ROLE_SCOPES, TASK_CATEGORIES, TASK_STAGES } from '@/lib/game-rules';
import {
  assertSameOrigin,
  optionalString,
  readJsonObject,
  requiredBoolean,
  requiredEnum,
  requiredInteger,
  requiredInvitationCode,
  requiredGuestRosterImportRows,
  requiredString,
  requiredUuid,
} from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    const type = requiredString(body.type, '操作类型', 40);
    let result: Record<string, unknown> = { ok: true };
    if (type === 'toggleVoting') {
      await setGameFlag('voting_open', requiredBoolean(body.value, '投票状态'), actor);
    } else if (type === 'toggleResults') {
      await setGameFlag('results_visible', requiredBoolean(body.value, '结果状态'), actor);
    } else if (type === 'toggleScoreboard') {
      await setGameFlag('scoreboard_visible', requiredBoolean(body.value, '大屏状态'), actor);
    } else if (type === 'toggleRegistration') {
      await setRegistrationOpen(requiredBoolean(body.value, '注册状态'), actor);
    } else if (type === 'rotateInvitationCode') {
      await setInvitationCode(requiredInvitationCode(body.code), actor);
    } else if (type === 'setStage') {
      await setGameStage(requiredEnum(body.stage, '游戏阶段', MANUAL_GAME_STAGES), actor);
    } else if (type === 'setGuestPhaseNote') {
      await setGuestPhaseNote(optionalString(body.note, '宾客端环节提示', 500), actor);
    } else if (type === 'resetGuestClaim') {
      await resetGuestClaim(requiredUuid(body.guestId, '宾客 ID'), actor);
    } else if (type === 'approve') {
      await approveAssignment(
        requiredUuid(body.assignmentId, '任务 ID'),
        actor,
        requiredString(body.verificationNote, '核验记录', 500),
      );
    } else if (type === 'completeAtStation') {
      await completeAssignmentAtStation(
        requiredUuid(body.assignmentId, '任务 ID'),
        actor,
        requiredString(body.verificationNote, '核验记录', 500),
      );
    } else if (type === 'reject') {
      const reason = body.reason === undefined ? '管理员退回' : requiredString(body.reason, '退回原因', 500);
      await rejectAssignment(requiredUuid(body.assignmentId, '任务 ID'), actor, reason);
    } else if (type === 'adjustPoints') {
      await adjustGuestPoints(
        requiredUuid(body.guestId, '宾客 ID'),
        requiredInteger(body.amount, '积分调整', -1000, 1000),
        actor,
        requiredString(body.reason, '调整原因', 200),
      );
    } else if (type === 'adjustTeamPoints') {
      await adjustTeamPoints(
        requiredString(body.team, '组别', 40),
        requiredInteger(body.amount, '团队积分调整', -1000, 1000),
        actor,
        requiredString(body.reason, '调整原因', 200),
      );
    } else if (type === 'setLiveDisplay') {
      await setLiveDisplay(
        optionalString(body.title, '大屏标题', 120),
        optionalString(body.body, '大屏内容', 1000),
        optionalString(body.publicClue, '公开线索', 500),
        requiredInteger(body.timerMinutes, '倒计时', 0, 120),
        actor,
      );
    } else if (type === 'assignTask') {
      await assignTaskToGuest(requiredUuid(body.guestId, '宾客 ID'), requiredUuid(body.taskId, '任务 ID'), actor);
    } else if (type === 'issueHiddenTaskCode') {
      result = { ok: true, code: await issueHiddenTaskCode(requiredUuid(body.taskId, '任务 ID'), actor) };
    } else if (type === 'redeemHiddenTaskCode') {
      await redeemHiddenTaskCode(
        requiredUuid(body.guestId, '宾客 ID'),
        requiredString(body.code, '隐藏任务码', 40),
        actor,
      );
    } else if (type === 'recordSpyPointEvent') {
      await recordSpyPointEvent({
        guestId: requiredUuid(body.guestId, '间谍宾客 ID'),
        reason: requiredEnum(body.reason, '间谍积分事件', ['team_wrong_answer', 'resource_wasted', 'ordinary_guest_suspected'] as const),
        note: optionalString(body.note, '现场记录', 300),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
      }, actor);
    } else if (type === 'resetRehearsal') {
      result = { ok: true, ...(await resetRehearsalData({
        confirmation: requiredString(body.confirmation, '清场确认词', 30),
        backupConfirmed: requiredBoolean(body.backupConfirmed, '备份确认'),
        reason: requiredString(body.reason, '清场原因', 300),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
      }, actor)) };
    } else if (type === 'grantClue') {
      await grantClueToGuest(requiredUuid(body.guestId, '宾客 ID'), requiredUuid(body.clueId, '线索 ID'), actor);
    } else if (type === 'configureGuest') {
      await configureGuestGameProfile(
        requiredUuid(body.guestId, '宾客 ID'),
        requiredString(body.team, '组别', 40),
        requiredEnum(body.role, '身份', GAME_ROLES),
        actor,
      );
    } else if (type === 'saveGuestRoster') {
      await saveGuestRoster({
        id: body.guestId ? requiredUuid(body.guestId, '宾客 ID') : null,
        name: requiredString(body.name, '宾客姓名', 120),
        loginName: requiredString(body.loginName, '登录名', 80),
        tableLabel: optionalString(body.tableLabel, '桌号', 40),
        isElder: requiredBoolean(body.isElder, '长辈标记'),
        ceremonyEligible: requiredBoolean(body.ceremonyEligible, '仪式任务标记'),
        active: requiredBoolean(body.active, '宾客启用状态'),
        staffNotes: optionalString(body.staffNotes, '工作人员备注', 300),
      }, actor);
    } else if (type === 'importGuestRoster') {
      result = { ok: true, importedCount: await importGuestRoster(requiredGuestRosterImportRows(body.rows), actor) };
    } else if (type === 'saveTask') {
      await saveGameTask({
        id: body.taskId ? requiredUuid(body.taskId, '任务 ID') : null,
        title: requiredString(body.title, '任务标题', 120),
        description: requiredString(body.description, '任务说明', 1000),
        verificationMethod: requiredString(body.verificationMethod, '验证方式', 500),
        points: requiredInteger(body.points, '任务积分', 1, 3),
        roleScope: requiredEnum(body.roleScope, '适用身份', ROLE_SCOPES),
        category: requiredEnum(body.category, '任务类型', TASK_CATEGORIES),
        stage: requiredEnum(body.stage, '任务阶段', TASK_STAGES),
        active: requiredBoolean(body.active, '任务启用状态'),
        grantsHiddenSpy: requiredBoolean(body.grantsHiddenSpy, '隐藏间谍奖励'),
      }, actor);
    } else if (type === 'saveClue') {
      await saveGameClue({
        id: body.clueId ? requiredUuid(body.clueId, '线索 ID') : null,
        title: requiredString(body.title, '线索标题', 120),
        content: requiredString(body.content, '线索内容', 1000),
        active: requiredBoolean(body.active, '线索启用状态'),
        spyGuestId: body.spyGuestId ? requiredUuid(body.spyGuestId, '对应间谍') : null,
        level: requiredInteger(body.level, '线索等级', 1, 3),
      }, actor);
    } else if (type === 'saveAward') {
      const winnerKind = requiredEnum(body.winnerKind, '获奖对象类型', ['none', 'guest', 'team'] as const);
      await saveAward({
        id: body.awardId ? requiredUuid(body.awardId, '奖项 ID') : null,
        title: requiredString(body.title, '奖项名称', 120),
        winnerGuestId: winnerKind === 'guest' ? requiredUuid(body.winnerGuestId, '获奖宾客') : null,
        winnerTeam: winnerKind === 'team' ? requiredString(body.winnerTeam, '获奖队伍', 40) : null,
        reason: optionalString(body.reason, '颁奖理由', 500),
        sortOrder: requiredInteger(body.sortOrder, '奖项顺序', 0, 9999),
        published: requiredBoolean(body.published, '发布状态'),
      }, actor);
    } else {
      throw new ApiError(400, '未知操作');
    }
    return noStoreJson(result);
  } catch (error) { return apiErrorResponse(error); }
}
