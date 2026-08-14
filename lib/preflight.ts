import { auditOfficialTaskCatalog } from './official-task-manifest.ts';

export { PHASE_ONE_MISSION_SPECS } from './official-task-manifest.ts';

export const WEDDING_TEAMS = ['海岛组', '沙漠组'] as const;

type PreflightGuest = {
  id: string; active: boolean; login_name?: string; team: string; role: string; is_hidden_spy: boolean;
  drawn_at: string | null; team_locked: boolean; role_locked: boolean; participation_mode: string;
  story_role?: string; phase_two_eligible?: boolean;
};
type PreflightTask = {
  id: string; title?: string; description?: string; verification_method?: string;
  active: boolean; is_demo?: boolean; role_scope: string; category: string; stage: string;
  mission_code?: string | null; points?: number; max_assignments?: number | null; story_role_scope?: string;
  mechanic?: string; score_policy?: string; assignment_mode?: string; verification_type?: string;
  grants_hidden_spy?: boolean;
};

export type PreflightItem = {
  id: string;
  label: string;
  detail: string;
  status: 'ready' | 'warning' | 'blocked';
};

function item(id: string, label: string, detail: string, ready: boolean, warning = false): PreflightItem {
  return { id, label, detail, status: ready ? 'ready' : warning ? 'warning' : 'blocked' };
}

export function buildWeddingPreflight(input: {
  guests: PreflightGuest[];
  tasks: PreflightTask[];
  hasGameState: boolean;
  invitationCodeRotated: boolean;
}) {
  const invitedGuests = input.guests.filter((guest) => guest.active);
  const activeGuests = invitedGuests.filter((guest) => guest.participation_mode === 'ACTIVE_PLAYER');
  const competitiveGuests = activeGuests.filter((guest) => guest.phase_two_eligible);
  const committedGuests = competitiveGuests.filter((guest) => guest.drawn_at || guest.team_locked);
  const familyGuests = invitedGuests.filter((guest) => guest.team === '家人组');
  const teamSummary = WEDDING_TEAMS.map((team) => {
    const members = committedGuests.filter((guest) => guest.team === team);
    const committedRoles = members.filter((guest) => guest.drawn_at || guest.role_locked);
    return {
      team,
      total: members.length,
      spies: committedRoles.filter((guest) => guest.role === 'spy' && !guest.is_hidden_spy).length,
      guests: committedRoles.filter((guest) => guest.role === 'guest').length,
    };
  });
  const capacityValid = committedGuests.every((guest) => WEDDING_TEAMS.includes(guest.team as typeof WEDDING_TEAMS[number]))
    && teamSummary.every((team) => team.total === 10 && team.spies <= 1 && team.guests <= 9);
  const officialCatalog = auditOfficialTaskCatalog(input.tasks);
  const officialCatalogProblems = [
    officialCatalog.missingCodes.length ? `缺少 ${officialCatalog.missingCodes.join('、')}` : '',
    officialCatalog.duplicateCodes.length ? `重复 ${officialCatalog.duplicateCodes.join('、')}` : '',
    officialCatalog.mismatches.length ? `配置错误 ${officialCatalog.mismatches.map((entry) => `${entry.missionCode}(${entry.fields.join('/')})`).join('、')}` : '',
    officialCatalog.unexpectedActiveCodes.length ? `未收录 ${officialCatalog.unexpectedActiveCodes.join('、')}` : '',
  ].filter(Boolean);
  const storyCounts = Object.fromEntries(['OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','HEART_HOLDER','STAR_HOLDER']
    .map((role) => [role, activeGuests.filter((guest) => guest.story_role === role).length]));
  const normalizedCast = new Map(activeGuests.map((guest) => [guest.login_name?.trim().toLowerCase(), guest.story_role ?? 'NONE']));
  const fixedCastReady = normalizedCast.get('yifan yu') === 'OFFICIANT'
    && normalizedCast.get('xingcheng jin') === 'RING_KEEPER'
    && normalizedCast.get('andao chen') === 'RING_KEEPER'
    && normalizedCast.get('siran li') === 'GROOM_CHEERLEADER'
    && normalizedCast.get('moshuang xu') === 'BRIDE_CHEERLEADER';
  const storyCastReady = storyCounts.OFFICIANT === 1 && storyCounts.RING_KEEPER === 2
    && storyCounts.GROOM_CHEERLEADER === 1 && storyCounts.BRIDE_CHEERLEADER === 1
    && storyCounts.HEART_HOLDER <= 5
    && storyCounts.STAR_HOLDER <= 5
    && activeGuests.every((guest) => ['NONE','OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','HEART_HOLDER','STAR_HOLDER'].includes(guest.story_role ?? 'NONE'))
    && activeGuests.every((guest) => guest.story_role === 'NONE' || guest.role !== 'spy')
    && fixedCastReady;
  const missionPlayers = activeGuests.filter((guest) => guest.phase_two_eligible || guest.team === '家人组');
  const jointFamilyReady = missionPlayers.some((guest) => guest.login_name?.trim().toLowerCase() === 'tianran chen & ziyou chen');
  const phaseOneCapacityReady = missionPlayers.length === 24
    && competitiveGuests.length === 20
    && missionPlayers.filter((guest) => guest.team === '家人组').length === 4
    && jointFamilyReady;
  const items: PreflightItem[] = [
    item('game-state', '核心流程状态可用', input.hasGameState ? '数据库流程状态已读取' : '无法读取 game_state', input.hasGameState),
    item('invitation-code', '正式邀请码已设置', input.invitationCodeRotated ? '已由主办方安全更新' : '仍是公开示例码或尚未在后台确认', input.invitationCodeRotated),
    item('guest-roster', '34 位宾客与 33 个登录账号', `${invitedGuests.length} 个账号可登录 · 家人组 ${familyGuests.length} 个账号 · 第二轮竞技玩家 ${competitiveGuests.length} 人`, invitedGuests.length === 33 && familyGuests.length === 11 && competitiveGuests.length === 20),
    item('draw-capacity', '竞技组容量没有冲突', teamSummary.map((team) => `${team.team} ${team.total}/10`).join(' · '), capacityValid),
    item('official-missions', '两轮正式任务配置正确', `${officialCatalog.matchingCount}/${officialCatalog.totalCount} 项符合定稿${officialCatalogProblems.length ? ` · ${officialCatalogProblems.join(' · ')}` : ''}`, officialCatalog.ready),
    item('phase-one-capacity', '第一轮 24 个任务账号可完整抽卡', `${missionPlayers.length}/24 个任务账号 · 竞技组 ${competitiveGuests.length}/20 · 家人任务账号 ${missionPlayers.filter((guest) => guest.team === '家人组').length}/4`, phaseOneCapacityReady),
    item('story-cast', '固定职务与随机图案池正确', `誓词 ${storyCounts.OFFICIANT} · 戒指 ${storyCounts.RING_KEEPER} · 应援 ${storyCounts.GROOM_CHEERLEADER + storyCounts.BRIDE_CHEERLEADER} · 已预设爱心 ${storyCounts.HEART_HOLDER}/5 · 已预设星星 ${storyCounts.STAR_HOLDER}/5`, storyCastReady),
  ];
  return {
    items,
    ready: items.every((entry) => entry.status === 'ready'),
    blockedCount: items.filter((entry) => entry.status === 'blocked').length,
  };
}
