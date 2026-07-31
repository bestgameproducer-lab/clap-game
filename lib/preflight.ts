export const WEDDING_TEAMS = ['玫瑰组', '月桂组', '星辰组', '琥珀组'] as const;

type PreflightGuest = {
  id: string; active: boolean; team: string; role: string; is_hidden_spy: boolean;
  drawn_at: string | null; team_locked: boolean; role_locked: boolean; participation_mode: string;
  story_role?: string;
};
type PreflightTask = { id: string; active: boolean; role_scope: string; category: string; stage: string; mission_code?: string | null; points?: number; max_assignments?: number | null };
type PreflightClue = { active: boolean; spy_guest_id: string | null };
type PreflightCode = { task_id: string };
type PreflightHostSegment = { ready: boolean; active: boolean; stage: string };
type PreflightWallet = { team: string };

export type PreflightItem = {
  id: string;
  label: string;
  detail: string;
  status: 'ready' | 'warning' | 'blocked';
};

export const PHASE_ONE_MISSION_SPECS = [
  ['P1-CER-001',5,1],['P1-CER-002',3,2],['P1-CER-003',3,1],['P1-CER-004',3,1],['P1-CER-005',3,2],
  ['P1-HEART-001',2,5],['P1-STAR-001',2,5],['P1-SOCIAL-001',2,null],['P1-BONUS-001',2,3],
  ['P1-DECOY-001',2,null],['P1-DECOY-002',2,2],['P1-DECOY-003',2,2],
  ['P1-DECOY-004',2,null],['P1-DECOY-005',2,null],['P1-DECOY-006',2,null],['P1-TRICKSTER-001',0,null],
] as const;

function item(id: string, label: string, detail: string, ready: boolean, warning = false): PreflightItem {
  return { id, label, detail, status: ready ? 'ready' : warning ? 'warning' : 'blocked' };
}

export function buildWeddingPreflight(input: {
  guests: PreflightGuest[];
  tasks: PreflightTask[];
  clues: PreflightClue[];
  hiddenTaskCodes: PreflightCode[];
  hostSegments: PreflightHostSegment[];
  resourceWallets: PreflightWallet[];
  hasGameState: boolean;
  invitationCodeRotated: boolean;
}) {
  const invitedGuests = input.guests.filter((guest) => guest.active);
  const activeGuests = invitedGuests.filter((guest) => guest.participation_mode === 'ACTIVE_PLAYER');
  const committedGuests = activeGuests.filter((guest) => guest.drawn_at || guest.team_locked);
  const activeTasks = input.tasks.filter((task) => task.active);
  const activeHidden = activeTasks.filter((task) => task.category === 'hidden');
  const codedHiddenIds = new Set(input.hiddenTaskCodes.map((code) => code.task_id));
  const spies = activeGuests.filter((guest) => guest.role === 'spy' && !guest.is_hidden_spy);
  const activeClues = input.clues.filter((clue) => clue.active);
  const teamSummary = WEDDING_TEAMS.map((team) => {
    const members = committedGuests.filter((guest) => guest.team === team);
    return {
      team,
      total: members.length,
      spies: members.filter((guest) => guest.role === 'spy' && !guest.is_hidden_spy).length,
      guests: members.filter((guest) => guest.role === 'guest').length,
    };
  });
  const capacityValid = committedGuests.every((guest) => WEDDING_TEAMS.includes(guest.team as typeof WEDDING_TEAMS[number]))
    && teamSummary.every((team) => team.total <= 8 && team.spies <= 1 && team.guests <= 7);
  const officialMissionCodes = PHASE_ONE_MISSION_SPECS.map(([code]) => code);
  const officialMissionCount = PHASE_ONE_MISSION_SPECS.filter(([code, points, maxAssignments]) => activeTasks.some((task) =>
    task.mission_code === code && task.points === points && (task.max_assignments ?? null) === maxAssignments)).length;
  const unexpectedPhaseOneTasks = activeTasks.filter((task) => task.stage === 'task_round_1' && !officialMissionCodes.includes(task.mission_code as typeof officialMissionCodes[number]));
  const storyCounts = Object.fromEntries(['OFFICIANT','RING_KEEPER','GROOM_CHEERLEADER','BRIDE_CHEERLEADER','APPLAUSE_STARTER','HEART_HOLDER','STAR_HOLDER']
    .map((role) => [role, activeGuests.filter((guest) => guest.story_role === role).length]));
  const storyCastReady = storyCounts.OFFICIANT === 1 && storyCounts.RING_KEEPER === 2
    && storyCounts.GROOM_CHEERLEADER === 1 && storyCounts.BRIDE_CHEERLEADER === 1
    && storyCounts.APPLAUSE_STARTER >= 1 && storyCounts.APPLAUSE_STARTER <= 2
    && storyCounts.HEART_HOLDER === 5
    && storyCounts.STAR_HOLDER === 5
    && activeGuests.every((guest) => guest.story_role === 'NONE' || guest.role !== 'spy');
  const hostSegments = input.hostSegments.filter((segment) => segment.active);
  const unreadyHostSegments = hostSegments.filter((segment) => !segment.ready).length;
  const missingWallets = WEDDING_TEAMS.filter((team) => !input.resourceWallets.some((wallet) => wallet.team === team));

  const items: PreflightItem[] = [
    item('game-state', '核心流程状态可用', input.hasGameState ? '数据库流程状态已读取' : '无法读取 game_state', input.hasGameState),
    item('invitation-code', '正式邀请码已设置', input.invitationCodeRotated ? '已由主办方安全更新' : '仍是公开示例码或尚未在后台确认', input.invitationCodeRotated),
    item('guest-roster', '32 位宾客名单', `${invitedGuests.length} 位可登录 · ${activeGuests.length} 位任务玩家`, invitedGuests.length === 32),
    item('draw-capacity', '抽卡容量没有冲突', teamSummary.map((team) => `${team.team} ${team.total}/8`).join(' · '), capacityValid),
    item('official-missions', '第一阶段任务、分值与人数正确', `${officialMissionCount}/${officialMissionCodes.length} 项符合定稿${unexpectedPhaseOneTasks.length ? ` · 另有 ${unexpectedPhaseOneTasks.length} 项非定稿任务仍启用` : ''}`, officialMissionCount === officialMissionCodes.length && unexpectedPhaseOneTasks.length === 0),
    item('story-cast', '第一阶段特殊职务人数正确', `誓词 ${storyCounts.OFFICIANT} · 戒指 ${storyCounts.RING_KEEPER} · 应援 ${storyCounts.GROOM_CHEERLEADER + storyCounts.BRIDE_CHEERLEADER} · 掌声 ${storyCounts.APPLAUSE_STARTER} · 爱心 ${storyCounts.HEART_HOLDER} · 星星 ${storyCounts.STAR_HOLDER}`, storyCastReady),
    item('upgrade-pool', '升级任务池充足', `${activeTasks.filter((task) => task.category === 'upgrade').length} 项启用（建议至少 5 项）`, activeTasks.filter((task) => task.category === 'upgrade').length >= 5),
    item('group-pool', '团队任务池已配置', `${activeTasks.filter((task) => task.category === 'group').length} 项启用`, activeTasks.some((task) => task.category === 'group')),
    item('hidden-cards', '四张隐藏任务实体卡', `${activeHidden.filter((task) => codedHiddenIds.has(task.id)).length}/${activeHidden.length} 项已有一次性代码`, activeHidden.length >= 4 && activeHidden.every((task) => codedHiddenIds.has(task.id))),
    item('generic-clues', '通用线索备用池', `${activeClues.filter((clue) => !clue.spy_guest_id).length} 条（建议至少 3 条）`, activeClues.filter((clue) => !clue.spy_guest_id).length >= 3),
    item('spy-clues', '每位初始间谍有专属线索', spies.length ? `${spies.filter((spy) => activeClues.some((clue) => clue.spy_guest_id === spy.id)).length}/${spies.length} 位覆盖` : '尚未预设初始间谍', spies.length > 0 && spies.every((spy) => activeClues.some((clue) => clue.spy_guest_id === spy.id))),
    item('host-content', '主持人题目与答案已复核', `${hostSegments.length - unreadyHostSegments}/${hostSegments.length} 个启用环节可发布`, hostSegments.length >= 7 && unreadyHostSegments === 0),
    item('resource-wallets', '竞拍金币钱包已初始化', missingWallets.length ? `缺少：${missingWallets.join('、')}` : '四队钱包均已建立', missingWallets.length === 0),
  ];
  return {
    items,
    ready: items.every((entry) => entry.status === 'ready'),
    blockedCount: items.filter((entry) => entry.status === 'blocked').length,
  };
}
