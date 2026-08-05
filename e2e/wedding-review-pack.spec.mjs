import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const outputRoot = process.env.WEDDING_REVIEW_DIR || 'artifacts/wedding-review-pack';
const avatar = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"%3E%3Crect width="160" height="160" rx="80" fill="%23eadbd2"/%3E%3Ccircle cx="80" cy="62" r="30" fill="%23a87866"/%3E%3Cpath d="M28 150c8-38 28-55 52-55s44 17 52 55" fill="%237b4f42"/%3E%3C/svg%3E';

const game = {
  registration_open: true, stage: 'registration', voting_open: false, voting_round: 0,
  results_visible: false, scoreboard_visible: false, phase_note: null,
  display_title: null, display_body: null, public_clue: null, timer_ends_at: null,
  invitation_code_updated_at: '2026-08-01T12:00:00.000Z', task_catalog_mode: 'live',
  trickster_max_attempts: 5, phase_one_completed_at: null, team_clues_settled_at: null,
  updated_at: '2026-08-01T14:00:00.000Z',
};

const guest = {
  id: 'guest-review', name: '王倩怡 Wang Qianyi', team: '海岛组', role: 'guest', is_hidden_spy: false,
  points: 2, drawn_at: '2026-08-01T12:00:00.000Z', special_card_revealed_at: null,
  participation_mode: 'ACTIVE_PLAYER', relationship: '新人好友', story_role: 'NONE',
  eligible_for_mission: true, eligible_for_secret_role: true, eligible_for_personal_score: true,
  special_card_title: '', special_card_body: '', player_code: 'R4CD', unlocked_role: '',
  avatar_path: 'guest-review/avatar.jpg', avatar_uploaded_at: '2026-08-01T11:30:00.000Z', avatar_url: avatar,
};

const couplePhotoTask = {
  title: '拍摄一张新郎新娘同框的照片',
  description: '在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。',
  verification_method: '上传照片或向任务站工作人员出示照片。', points: 2,
  category: 'standard', stage: 'task_round_1', mission_code: 'P1-SOCIAL-002',
  mechanic: 'STANDARD', score_policy: 'STANDARD',
};

const baseStory = {
  playerCode: 'R4CD', unlockedRole: '', symbolPairing: null, relationships: [],
  tricksterAttemptsUsed: 0, tricksterMaxAttempts: 5, mutualConfirmations: [], allianceClue: null,
};

function assignment(id, task, status = 'assigned', extra = {}) {
  return {
    id, status, is_initial: true, completion_rank: null, early_bonus_points: 0,
    reward_task_id: null, reward_clue_id: null, completion_note: '', verification_note: '',
    verified_at: null, evidence_uploaded_at: null, evidence_url: null, rejection_reason: null,
    task, ...extra,
  };
}

function guestData(overrides = {}) {
  return {
    guest, assignments: [assignment('photo-1', couplePhotoTask)], clues: [], game,
    candidates: [], existingVote: null, pointLedger: [],
    teamScores: [{ team: '海岛组', points: 8 }, { team: '沙漠组', points: 6 }],
    results: null, missionStory: baseStory, phaseTwo: null, ...overrides,
  };
}

async function screenshot(page, file, project) {
  const directory = join(outputRoot, project);
  await mkdir(directory, { recursive: true });
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.screenshot({ path: join(directory, `${file}.png`), fullPage: true, animations: 'disabled' });
}

async function dismissNotice(page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) {
    const button = dialog.getByRole('button', { name: /知道了|查看更新|接受我的新命运/ });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}

async function routeGuestData(page, initialData) {
  const state = { current: initialData };
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: state.current }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ status: 401, json: { error: '需要邀请码' } }));
  await page.route('**/api/player-directory', (route) => route.fulfill({ json: {
    players: [
      { name: '徐莫双 Moshuang Xu', playerCode: 'H2XK', avatarUrl: avatar },
      { name: '謝菲菲 Feifei Xie', playerCode: 'K7M4', avatarUrl: avatar },
    ],
  } }));
  return state;
}

test('@mobile-review 宾客完整视觉旅程', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /进入婚礼任务/ })).toBeVisible();
  await screenshot(page, '01-home-invitation', testInfo.project.name);

  let registrationData = null;
  const registrationGuests = [
    { id: 'guest-review', name: '王倩怡 Wang Qianyi', loginName: 'Qianyi Wang', hasPassword: false },
    { id: 'guest-returning', name: '謝菲菲 Feifei Xie', loginName: 'Feifei Xie', hasPassword: true },
  ];
  const avatarMissing = guestData({ guest: { ...guest, drawn_at: null, avatar_path: null, avatar_uploaded_at: null, avatar_url: null } });
  await page.route('**/api/guest-me', (route) => registrationData ? route.fulfill({ json: registrationData }) : route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
  await page.route('**/api/registration/guests', (route) => route.request().method() === 'POST'
    ? route.fulfill({ json: { guests: registrationGuests, registrationOpen: true } })
    : route.fulfill({ status: 401, json: { error: '需要邀请码' } }));
  await page.route('**/api/registration/claim', (route) => {
    registrationData = avatarMissing;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/guest');
  await expect(page.getByLabel('婚礼邀请码')).toBeVisible();
  await screenshot(page, '02-invitation-gate', testInfo.project.name);

  await page.getByLabel('婚礼邀请码').fill('REVIEW');
  await page.getByRole('button', { name: '进入宾客名单' }).click();
  await expect(page.getByLabel('搜索宾客')).toBeVisible();
  await screenshot(page, '03-guest-roster', testInfo.project.name);

  await page.getByRole('button', { name: /王倩怡/ }).click();
  await expect(page.getByText('设置你的四位密码')).toBeVisible();
  await screenshot(page, '04-create-pin', testInfo.project.name);

  await page.getByLabel('四位数字密码').fill('2468');
  await page.getByLabel('再次输入密码').fill('2468');
  await page.getByRole('button', { name: '设置密码 · 下一步' }).click();
  await expect(page.getByRole('heading', { name: /拍一张开心的/ })).toBeVisible();
  await screenshot(page, '05-selfie-required', testInfo.project.name);

  await page.unroute('**/api/guest-me');
  await page.unroute('**/api/registration/guests');
  const drawState = await routeGuestData(page, guestData({ guest: { ...guest, drawn_at: null } }));
  const revealedCard = {
    team: '海岛组', role: 'guest', storyRole: 'NONE', drawnAt: '2026-08-01T12:00:00.000Z',
    task: { id: 'task-photo', title: couplePhotoTask.title, description: couplePhotoTask.description, verificationMethod: couplePhotoTask.verification_method, points: 2 },
  };
  await page.route('**/api/draw-card', (route) => {
    drawState.current = guestData();
    return route.fulfill({ json: { card: revealedCard } });
  });
  await page.goto('/guest');
  await expect(page.getByRole('button', { name: '抽取我的秘密卡' }).first()).toBeVisible();
  await screenshot(page, '06-card-draw-ready', testInfo.project.name);
  await page.getByRole('button', { name: '抽取我的秘密卡' }).first().click();
  await expect(page.getByRole('heading', { name: '命运之卡已经揭晓' })).toBeVisible({ timeout: 5_000 });
  await screenshot(page, '07-card-revealed', testInfo.project.name);

  await page.getByRole('button', { name: '我已经看清楚 · 收起卡片' }).click();
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('选择或拍摄新郎新娘同框照片')).toBeVisible();
  await screenshot(page, '08-round-one-task', testInfo.project.name);

  const starTask = {
    title: '寻找星星伙伴', description: '找到持有另一半星星的玩家，组成星光联盟。',
    verification_method: '双方在软件中确认。', points: 2, category: 'standard', stage: 'task_round_1',
    mission_code: 'P1-STAR-001', mechanic: 'STAR_MATCH', score_policy: 'STANDARD',
  };
  drawState.current = guestData({
    assignments: [assignment('star-1', starTask)],
    missionStory: { ...baseStory, symbolPairing: { symbol: 'STAR', status: 'AVAILABLE', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: null } },
  });
  await page.reload(); await dismissNotice(page);
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('右半星星')).toBeVisible();
  await screenshot(page, '09-symbol-pairing', testInfo.project.name);

  drawState.current = guestData({ game: { ...game, stage: 'task_round_1', registration_open: false } });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByText(/婚礼仪式进行中 · 照片上传/)).toBeVisible();
  await screenshot(page, '10-ceremony-pause', testInfo.project.name);

  const guideTask = {
    title: '领航星', description: '召集队友、理解团队挑战，并带领大家前进。',
    verification_method: '团队挑战结束后由系统结算。', points: 0, category: 'upgrade', stage: 'task_round_2',
    mission_code: 'P2-GUIDE-001', mechanic: 'TEAM_CAPTAIN', score_policy: 'NO_PERSONAL',
  };
  drawState.current = guestData({
    guest: { ...guest, unlocked_role: 'GUIDING_STAR' },
    game: { ...game, stage: 'task_round_2', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('guide-1', guideTask)],
    phaseTwo: { mission: 'TEAM_CAPTAIN', extraVote: false, superLucky: false, isCaptain: true, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [] },
  });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('落单的星光');
  await screenshot(page, '11-awakening-notice', testInfo.project.name);
  await dismissNotice(page);

  const dilemmaTask = {
    title: '星光抉择', description: '你与星光伙伴将面对丘比特留下的最后一道默契考验。',
    verification_method: '系统等待双方秘密提交后自动结算。', points: 0, category: 'upgrade', stage: 'task_round_2',
    mission_code: 'P2-STAR-001', mechanic: 'SECRET_DILEMMA', score_policy: 'NO_PERSONAL',
  };
  drawState.current = guestData({
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('dilemma-1', dilemmaTask)],
    phaseTwo: { mission: 'STAR_DILEMMA', extraVote: false, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: { allianceType: 'STAR', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null }, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('星光伙伴的抉择')).toBeVisible();
  await screenshot(page, '12-secret-dilemma', testInfo.project.name);

  await page.getByRole('button', { name: /查看今日菜单/ }).click();
  await expect(page.getByRole('img', { name: /婚宴菜单/ })).toBeVisible();
  await screenshot(page, '13-dinner-menu', testInfo.project.name);
  await page.getByRole('button', { name: '看完菜单 · 返回游戏' }).click();

  const tricksterSignal = {
    title: '寻找恶作剧者同伴', description: '使用只有恶作剧者知道的暗号寻找真正同伴。',
    verification_method: '双方通过暗号并在软件中确认。', points: 0, category: 'hidden', stage: 'task_round_1',
    mission_code: 'P1-TRICKSTER-001', mechanic: 'TRICKSTER_SIGNAL', score_policy: 'NO_PERSONAL',
  };
  drawState.current = guestData({
    guest: { ...guest, role: 'spy', name: '刘俊恒 Junheng Liu' },
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('facade-1', couplePhotoTask), assignment('signal-1', tricksterSignal, 'approved')],
    missionStory: { ...baseStory, relationships: [{ id: 'trickster-pair', type: 'TRICKSTER_CONNECTION', status: 'ACTIVE', partnerName: '另一位恶作剧者', confirmedByMe: true, confirmedByPartner: true, activatedAt: '2026-08-01T13:20:00.000Z' }] },
    phaseTwo: { mission: 'TRICKSTER', extraVote: true, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 0, luckySettled: false, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await screenshot(page, '14-trickster-facade', testInfo.project.name);
  await page.getByRole('button', { name: '展开查看' }).click();
  await expect(page.getByText('额外一票已解锁', { exact: true }).first()).toBeVisible();
  await screenshot(page, '15-trickster-truth', testInfo.project.name);

  drawState.current = guestData({
    game: { ...game, stage: 'voting', registration_open: false, voting_open: true, voting_round: 1, phase_one_completed_at: '2026-08-01T13:00:00.000Z', team_clues_settled_at: '2026-08-01T14:30:00.000Z' },
    candidates: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组' }, { id: 'suspect-2', name: '可疑宾客 B', team: '海岛组' }],
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByRole('heading', { name: '谁是恶作剧者？' })).toBeVisible();
  await screenshot(page, '16-final-vote', testInfo.project.name);

  const finale = {
    tricksters: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组', escaped: false }, { id: 'spy-2', name: '另一位恶作剧者', team: '沙漠组', escaped: true }],
    voteCounts: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组', votes: 3, voters: [{ id: 'v1', name: '玩家甲', team: '海岛组', votes: 2 }, { id: 'v2', name: '玩家乙', team: '海岛组', votes: 1 }] }],
  };
  drawState.current = guestData({
    game: { ...game, stage: 'results', registration_open: false, voting_open: false, voting_round: 1, results_visible: true, scoreboard_visible: true, phase_one_completed_at: '2026-08-01T13:00:00.000Z', team_clues_settled_at: '2026-08-01T14:30:00.000Z', team_score_snapshot: { 海岛组: 13, 沙漠组: 20 } },
    existingVote: 'suspect-1',
    results: { ...finale, votedTargetId: 'suspect-1', votedTargetName: '可疑宾客 A', voteCorrect: true, bonusPoints: 2 },
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await screenshot(page, '17-guest-results', testInfo.project.name);
});

test('@desktop-review 工作人员与公开终局视觉旅程', async ({ page }, testInfo) => {
  const staffGuest = { ...guest, login_name: 'qianyi wang', claimed_at: '2026-08-01T11:00:00.000Z', team_locked: true, role_locked: false, table_label: 'A1', is_elder: false, ceremony_eligible: false, active: true, staff_notes: '', uses_app: true, phase_two_eligible: true };
  const finalePersonal = Array.from({ length: 12 }, (_, index) => ({ id: `p-${index}`, name: index === 11 ? '家人嘉宾' : `宾客 ${index + 1}`, team: index === 11 ? '家人组' : index % 2 ? '海岛组' : '沙漠组', points: 18 - index, completedTasks: 2, undetectedTrickster: index === 0 }));
  const finale = { tricksters: [{ id: 'p-0', name: '宾客 1', team: '沙漠组', escaped: true }], voteCounts: [{ id: 'p-0', name: '宾客 1', team: '沙漠组', votes: 3, voters: [{ id: 'v1', name: '宾客 3', team: '沙漠组', votes: 2 }, { id: 'v2', name: '宾客 5', team: '沙漠组', votes: 1 }] }] };
  const emptyReset = { claimed_guests: 10, drawn_guests: 8, assignments: 12, evidence_files: 2, avatar_files: 7, votes: 0, guest_clues: 0, personal_ledger_entries: 9, team_ledger_entries: 2, spy_ledger_entries: 0, resource_ledger_entries: 0, registration_open: true, voting_open: false, scoreboard_visible: false };
  const adminData = {
    health: { database: 'online', checkedAt: '2026-08-01T14:05:00.000Z', deploymentVersion: 'visual-review' },
    guests: [staffGuest], assignments: [], tasks: [], clues: [], submissions: [], votes: [], pointLedger: [], auditLog: [], awards: [], teamPointLedger: [], resultRewards: [], hiddenTaskCodes: [], heartSlots: [], playerRelationships: [], allianceClues: [], symbolPairings: [], phaseTwoProfiles: [],
    game: { ...game, stage: 'registration' }, rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
    preflight: { ready: true, blockedCount: 0, items: [
      { id: 'roster', label: '32 位宾客名单', detail: '名单与组别已经确认', status: 'ready' },
      { id: 'missions', label: '第一轮任务容量', detail: '正式任务池可完成抽卡', status: 'ready' },
    ] },
    rehearsalResetPreview: emptyReset,
  };
  const adminState = { current: adminData };
  await page.route('**/api/admin-data', (route) => route.fulfill({ json: adminState.current }));
  await page.goto('/admin');
  await expect(page.getByText('系统在线')).toBeVisible();
  await screenshot(page, '20-admin-opening', testInfo.project.name);

  await page.locator('.admin-panel-tabs').getByRole('button', { name: '现场执行', exact: true }).click();
  await expect(page.getByText('流程控制')).toBeVisible();
  await screenshot(page, '21-admin-live-flow', testInfo.project.name);

  adminState.current = { ...adminData, game: { ...game, stage: 'group_game', registration_open: false, team_clues_settled_at: '2026-08-01T14:30:00.000Z' }, rankings: { personal: finalePersonal, teams: [{ team: '沙漠组', points: 20 }, { team: '海岛组', points: 13 }] }, finale };
  await page.reload();
  await page.locator('.admin-panel-tabs').getByRole('button', { name: '终局结算', exact: true }).click();
  await expect(page.getByRole('heading', { name: '终局结算流程' })).toBeVisible();
  await screenshot(page, '22-admin-finale', testInfo.project.name);

  const hostData = {
    guests: [{ ...guest, name: '王倩怡', special_card_title: '' }, { ...guest, id: 'spy-host', name: '恶作剧者', role: 'spy', team: '沙漠组', special_card_title: '' }],
    teamPoints: [{ id: 1, team: '海岛组', amount: 8, reason: '团队挑战' }], personalPoints: [],
    game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null },
    voteCount: 0, teamClueCounts: { 海岛组: 2, 沙漠组: 2 }, rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
  };
  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostData }));
  await page.goto('/host');
  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await screenshot(page, '23-host-console', testInfo.project.name);

  const stationTask = { id: 'station-task', ...couplePhotoTask };
  const stationData = {
    guests: [{ id: guest.id, name: guest.name, login_name: 'qianyi wang', team: '海岛组', points: 2, claimed_at: '2026-08-01T11:00:00.000Z', drawn_at: '2026-08-01T12:00:00.000Z' }],
    assignments: [{ ...assignment('station-assignment', stationTask, 'submitted'), guest_id: guest.id, submitted_at: '2026-08-01T13:45:00.000Z', approved_at: null, rejected_at: null, completion_note: '已经拍到新人在仪式后的同框照片。', evidence_url: null, task: stationTask }],
    tasks: [stationTask], clues: [], game: { stage: 'ceremony_end' },
  };
  await page.route('**/api/station-data', (route) => route.fulfill({ json: stationData }));
  await page.goto('/station');
  await expect(page.getByRole('heading', { name: /丘比特.*任务站/ })).toBeVisible();
  await screenshot(page, '24-station-review', testInfo.project.name);

  await page.route('**/api/public-scoreboard', (route) => route.fulfill({ json: {
    visible: true, stage: 'results', resultsVisible: true, displayTitle: null, displayBody: null, publicClue: null, timerEndsAt: null, updatedAt: '2026-08-01T15:00:00.000Z',
    teams: [{ team: '沙漠组', points: 20, completedTasks: 12, guestCount: 10 }, { team: '海岛组', points: 13, completedTasks: 11, guestCount: 10 }],
    leaders: finalePersonal, voteCounts: finale.voteCounts,
    revealedRoles: finale.tricksters.map((item) => ({ ...item, role: 'spy', is_hidden_spy: false })), awards: [],
  } }));
  await page.goto('/scoreboard');
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await screenshot(page, '25-public-finale', testInfo.project.name);
});
