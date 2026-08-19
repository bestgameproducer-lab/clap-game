import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OFFICIAL_TASK_MANIFEST } from '../lib/official-task-manifest.ts';

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

function officialTask(missionCode) {
  const task = OFFICIAL_TASK_MANIFEST.find((candidate) => candidate.mission_code === missionCode);
  if (!task) throw new Error(`official_task_missing:${missionCode}`);
  return { ...task };
}

const couplePhotoTask = officialTask('P1-SOCIAL-002');

const baseStory = {
  playerCode: 'R4CD', unlockedRole: '', symbolPairing: null, relationships: [],
  tricksterAttemptsUsed: 0, tricksterMaxAttempts: 5, mutualConfirmations: [],
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
    candidates: [], existingVote: null, pointLedger: [], votingEligible: true,
    // Match the authenticated DTO boundary: team scores are absent until the
    // team challenge opens, so early screenshots cannot imply a live ranking.
    teamScores: [],
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
  const dialog = page.locator('.new-content-dialog');
  const button = dialog.getByRole('button', { name: /知道了|查看更新|接受我的新命运|收下结果/ });
  const appeared = await button.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await button.click();
  await expect(dialog).toBeHidden();
}

async function expandFirstMission(page) {
  const mission = page.locator('#guest-missions details').first();
  if ((await mission.getAttribute('open')) === null) await mission.locator('summary').click();
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

const STORY_ROLE_TASKS = {
  OFFICIANT: 'P1-CER-001',
  RING_KEEPER: 'P1-CER-002',
  GROOM_CHEERLEADER: 'P1-CER-003',
  BRIDE_CHEERLEADER: 'P1-CER-004',
  HEART_HOLDER: 'P1-HEART-001',
  STAR_HOLDER: 'P1-STAR-001',
};

function phaseTwoReviewState(missionCode) {
  const shared = {
    extraVote: false, superLucky: false, isCaptain: false, unlockedAt: null,
    phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false,
    originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [],
  };
  if (missionCode === 'P2-HEART-001') return { ...shared, mission: 'HEART_DILEMMA', dilemma: { allianceType: 'HEART', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null } };
  if (missionCode === 'P2-STAR-001') return { ...shared, mission: 'STAR_DILEMMA', dilemma: { allianceType: 'STAR', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null } };
  if (missionCode === 'P2-LONELY-001') return { ...shared, mission: 'COPY_SCORE', copyCandidates: [{ id: 'copy-a', name: '徐莫双 Moshuang Xu', team: '海岛组' }, { id: 'copy-b', name: '任易 Yi Ren', team: '沙漠组' }] };
  if (missionCode === 'P2-GUIDE-001') return { ...shared, mission: 'TEAM_CAPTAIN', isCaptain: true };
  if (missionCode === 'P2-TRICKSTER-001') return { ...shared, mission: 'TRICKSTER' };
  if (missionCode === 'P2-POWER-001') return { ...shared, mission: 'EXTRA_VOTE', extraVote: true };
  if (missionCode === 'P2-LUCKY-001') return { ...shared, mission: 'SUPER_LUCKY', superLucky: true, luckySettled: true };
  return null;
}

function taskVisualState(task, index) {
  const phaseTwoTask = task.stage === 'task_round_2';
  const spyTask = ['P1-TRICKSTER-001', 'P2-TRICKSTER-001', 'P2-POWER-001'].includes(task.mission_code);
  const completedTask = ['P1-BONUS-001', 'P2-POWER-001', 'P2-LUCKY-001'].includes(task.mission_code);
  const storyRole = task.story_role_scope && task.story_role_scope !== 'NONE' ? task.story_role_scope : 'NONE';
  const symbolPairing = task.mission_code === 'P1-HEART-001'
    ? { symbol: 'HEART', status: 'AVAILABLE', fragmentSide: 'LEFT', pendingRelationshipId: null, finalizedAt: null }
    : task.mission_code === 'P1-STAR-001'
      ? { symbol: 'STAR', status: 'AVAILABLE', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: null }
      : null;
  return guestData({
    guest: {
      ...guest,
      role: spyTask ? 'spy' : 'guest',
      story_role: storyRole,
      unlocked_role: task.mission_code === 'P2-LONELY-001' ? 'LONELY_CUPID' : task.mission_code === 'P2-GUIDE-001' ? 'GUIDING_STAR' : '',
    },
    game: {
      ...game,
      stage: phaseTwoTask ? 'banquet' : 'ceremony_end',
      registration_open: false,
      phase_one_completed_at: phaseTwoTask ? '2026-08-01T13:00:00.000Z' : null,
    },
    assignments: [assignment(`official-${index}`, task, completedTask ? 'approved' : 'assigned', completedTask ? { verification_note: '系统已经完成并记录本任务。' } : {})],
    missionStory: { ...baseStory, symbolPairing },
    phaseTwo: phaseTwoReviewState(task.mission_code),
  });
}

test('@mobile-review 宾客完整视觉旅程', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /领取我的秘密身份/ })).toBeVisible();
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
  await page.locator('#guest-avatar-library-photo').setInputFiles({
    name: 'review-selfie.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP4z8AAQmAEMDEwMDAAAAwAAf8CBR0AAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByRole('img', { name: '待上传的婚礼自拍预览' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新拍摄婚礼自拍' })).toBeVisible();
  await screenshot(page, '05b-selfie-preview-retake', testInfo.project.name);

  await page.unroute('**/api/guest-me');
  await page.unroute('**/api/registration/guests');
  const drawState = await routeGuestData(page, guestData({ guest: { ...guest, drawn_at: null } }));
  const revealedCard = {
    team: '海岛组', role: 'guest', storyRole: 'NONE', drawnAt: '2026-08-01T12:00:00.000Z',
    task: { id: 'task-photo', title: couplePhotoTask.title, description: couplePhotoTask.description, verificationMethod: couplePhotoTask.verification_method, points: 2 },
  };
  let nextCard = revealedCard;
  await page.route('**/api/draw-card', (route) => {
    drawState.current = guestData({ guest: { ...guest, role: nextCard.role, story_role: nextCard.storyRole } });
    return route.fulfill({ json: { card: nextCard } });
  });
  await page.goto('/guest');
  await expect(page.getByRole('button', { name: '抽取我的秘密卡' }).first()).toBeVisible();
  await screenshot(page, '06-card-draw-ready', testInfo.project.name);
  await page.getByRole('button', { name: '抽取我的秘密卡' }).first().click();
  await expect(page.getByRole('heading', { name: '命运之卡已经揭晓' })).toBeVisible({ timeout: 5_000 });
  await screenshot(page, '07-card-revealed', testInfo.project.name);

  await page.getByRole('button', { name: '我已经看清楚 · 收起卡片' }).click();
  const missionHeading = page.getByRole('heading', { name: '我的秘密任务' });
  await expect(missionHeading).toBeVisible();
  await expect.poll(() => missionHeading.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.whiteSpace === 'nowrap' && element.scrollWidth <= element.clientWidth + 1;
  })).toBe(true);
  await expandFirstMission(page);
  await expect(page.getByText('添加新郎新娘同框照片')).toBeVisible();
  await expect(page.getByText('拍摄照片或从相册选择')).toBeVisible();
  await screenshot(page, '08-round-one-task', testInfo.project.name);

  drawState.current = guestData({ assignments: [assignment('photo-1', couplePhotoTask, 'approved', { verification_note: '任务站已确认完成。' })] });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText(/你的任务(已|收到)更新/);
  await screenshot(page, '08b-new-activity-after-return', testInfo.project.name);
  await dismissNotice(page);
  drawState.current = guestData();

  nextCard = {
    ...revealedCard,
    role: 'spy',
    task: { ...revealedCard.task, id: 'task-facade', title: '和第一次见面的朋友合影', description: '找到今天第一次见面的宾客，互相介绍后留下一张合影。' },
  };
  drawState.current = guestData({ guest: { ...guest, role: 'spy', drawn_at: null } });
  await page.reload();
  await page.getByRole('button', { name: '抽取我的秘密卡' }).first().click();
  await expect(page.getByText('这不是你的真正任务')).toBeVisible();
  await screenshot(page, '07b-trickster-card-reveal', testInfo.project.name);
  await page.getByRole('button', { name: '我已经看清楚 · 收起卡片' }).click();
  nextCard = revealedCard;

  const ringTask = officialTask('P1-CER-002');
  drawState.current = guestData({
    guest: { ...guest, story_role: 'RING_KEEPER' },
    assignments: [assignment('ring-1', ringTask)],
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByText('戒指守护者', { exact: true }).first()).toBeVisible();
  await screenshot(page, '08b-public-ceremony-role', testInfo.project.name);

  const starTask = officialTask('P1-STAR-001');
  drawState.current = guestData({
    assignments: [assignment('star-1', starTask)],
    missionStory: { ...baseStory, symbolPairing: { symbol: 'STAR', status: 'AVAILABLE', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: null } },
  });
  await page.reload(); await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByText('右半星星')).toBeVisible();
  await screenshot(page, '09-symbol-pairing', testInfo.project.name);

  await page.getByRole('button', { name: '查询玩家' }).click();
  await expect(page.getByRole('heading', { name: '宾客验证列表' })).toBeVisible();
  await screenshot(page, '09b-player-directory', testInfo.project.name);
  await page.getByRole('button', { name: '找到了 · 返回游戏' }).click();

  drawState.current = guestData({
    assignments: [assignment('star-1', starTask)],
    missionStory: {
      ...baseStory,
      symbolPairing: { symbol: 'STAR', status: 'AVAILABLE', fragmentSide: 'RIGHT', pendingRelationshipId: 'star-incoming', finalizedAt: null },
      relationships: [{ id: 'star-incoming', type: 'STAR_ALLIANCE', status: 'PENDING', partnerName: '謝菲菲 Feifei Xie', confirmedByMe: false, confirmedByPartner: true, activatedAt: null }],
    },
  });
  await page.reload(); await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByRole('button', { name: '接受邀请' })).toBeVisible();
  await screenshot(page, '09c-pairing-invitation', testInfo.project.name);

  drawState.current = guestData({
    assignments: [assignment('star-1', starTask, 'approved')],
    missionStory: {
      ...baseStory,
      symbolPairing: { symbol: 'STAR', status: 'PAIRED', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: '2026-08-01T12:45:00.000Z' },
      relationships: [{ id: 'star-paired', type: 'STAR_ALLIANCE', status: 'ACTIVE', partnerName: '謝菲菲 Feifei Xie', confirmedByMe: true, confirmedByPartner: true, activatedAt: '2026-08-01T12:45:00.000Z' }],
    },
  });
  await page.reload(); await dismissNotice(page);
  await page.getByRole('button', { name: /已完成任务（1）/ }).click();
  await expandFirstMission(page);
  await expect(page.getByText('完整星星', { exact: true })).toBeVisible();
  await screenshot(page, '09d-star-match-complete', testInfo.project.name);

  const heartTask = officialTask('P1-HEART-001');
  drawState.current = guestData({
    assignments: [assignment('heart-1', heartTask)],
    missionStory: { ...baseStory, symbolPairing: { symbol: 'HEART', status: 'AVAILABLE', fragmentSide: 'LEFT', pendingRelationshipId: null, finalizedAt: null } },
  });
  await page.reload(); await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByText('左半爱心')).toBeVisible();
  await screenshot(page, '09e-heart-pairing', testInfo.project.name);

  drawState.current = guestData({ game: { ...game, stage: 'task_round_1', registration_open: false } });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByText(/婚礼仪式进行中 · 照片上传/)).toBeVisible();
  await screenshot(page, '10-ceremony-pause', testInfo.project.name);

  const guideTask = officialTask('P2-GUIDE-001');
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
  await expandFirstMission(page);
  await expect(page.getByText('你没有失败，这项能力正来自那次落单')).toBeVisible();
  await screenshot(page, '11b-guiding-star-mission', testInfo.project.name);

  const lonelyTask = officialTask('P2-LONELY-001');
  drawState.current = guestData({
    guest: { ...guest, unlocked_role: 'LONELY_CUPID' },
    game: { ...game, stage: 'task_round_2', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('lonely-1', lonelyTask)],
    phaseTwo: { mission: 'COPY_SCORE', extraVote: false, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [{ id: 'copy-1', name: '徐莫双 Moshuang Xu', team: '海岛组' }, { id: 'copy-2', name: '任易 Yi Ren', team: '沙漠组' }] },
  });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('原来，你从未被遗忘');
  await screenshot(page, '11c-lonely-cupid-awakening', testInfo.project.name);
  await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByLabel('选择要复制命运的玩家')).toBeVisible();
  await screenshot(page, '11d-lonely-cupid-choice', testInfo.project.name);

  const dilemmaTask = officialTask('P2-STAR-001');
  drawState.current = guestData({
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('dilemma-1', dilemmaTask)],
    phaseTwo: { mission: 'STAR_DILEMMA', extraVote: false, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: { allianceType: 'STAR', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null }, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByText('星光伙伴的抉择')).toBeVisible();
  await screenshot(page, '12-secret-dilemma', testInfo.project.name);

  const heartDilemmaTask = officialTask('P2-HEART-001');
  drawState.current = guestData({
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('heart-dilemma-1', heartDilemmaTask)],
    phaseTwo: { mission: 'HEART_DILEMMA', extraVote: false, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: { allianceType: 'HEART', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null }, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.getByText('爱心联盟的考验')).toBeVisible();
  await screenshot(page, '12b-heart-dilemma', testInfo.project.name);

  const settledDilemma = (allianceType, myChoice, partnerChoice, myPoints, partnerPoints) => ({
    mission: `${allianceType}_DILEMMA`, extraVote: false, superLucky: false, isCaptain: false,
    unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2,
    luckySettled: false, captainSettled: false, originVerified: true,
    dilemma: { allianceType, submitted: true, settled: true, myChoice, partnerChoice, myPoints, partnerPoints },
    copyChoice: null, copyCandidates: [],
  });
  const resultCases = [
    { file: '12c-star-mutual-result', task: dilemmaTask, phaseTwo: settledDilemma('STAR', 'TOGETHER', 'TOGETHER', 3, 3), title: '两颗星光并肩抵达' },
    { file: '12d-star-personal-win', task: dilemmaTask, phaseTwo: settledDilemma('STAR', 'TAKE_ALL', 'TOGETHER', 5, 0), title: '你独自带走了星光' },
    { file: '12e-heart-partner-win', task: heartDilemmaTask, phaseTwo: settledDilemma('HEART', 'LOVE', 'HATE', 0, 5), title: '两颗心在岔路口错开' },
    { file: '12f-heart-mutual-guarded', task: heartDilemmaTask, phaseTwo: settledDilemma('HEART', 'HATE', 'HATE', 1, 1), title: '两颗爱心都保留了秘密' },
  ];
  for (const resultCase of resultCases) {
    drawState.current = guestData({
      game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
      assignments: [assignment(`result-${resultCase.file}`, resultCase.task, 'approved')],
      phaseTwo: resultCase.phaseTwo,
    });
    await page.reload();
    await expect(page.getByRole('dialog')).toContainText(resultCase.title);
    await screenshot(page, resultCase.file, testInfo.project.name);
    await dismissNotice(page);
  }

  const luckyTask = officialTask('P2-LUCKY-001');
  drawState.current = guestData({
    guest: { ...guest, points: 8 },
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('lucky-1', luckyTask, 'approved', { verification_note: '系统已完成幸运积分翻倍。' })],
    pointLedger: [{ id: 'ledger-1', label: '第一轮任务积分', amount: 4, createdAt: '2026-08-01T12:30:00.000Z' }, { id: 'ledger-2', label: '丘比特幸运星 · 第一轮积分翻倍', amount: 4, createdAt: '2026-08-01T13:30:00.000Z' }],
    phaseTwo: { mission: 'SUPER_LUCKY', extraVote: false, superLucky: true, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 4, luckySettled: true, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  const scoreLedgerClose = page.getByRole('button', { name: '看清楚了 · 关闭' });
  if (!(await scoreLedgerClose.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /查看我的积分流水/ }).click();
  }
  await expect(page.getByText('丘比特幸运星 · 第一轮积分翻倍')).toBeVisible();
  await screenshot(page, '12g-lucky-star-ledger', testInfo.project.name);
  await scoreLedgerClose.click();

  drawState.current = guestData({
    guest: { ...guest, participation_mode: 'HONOR_GUEST', team: '家人组', role: 'guest', eligible_for_mission: false, eligible_for_secret_role: false, special_card_title: '一路相伴', special_card_body: '谢谢你一直守护着这个家，也见证两个人走到今天。', special_card_revealed_at: null },
    assignments: [], clues: [], phaseTwo: null,
  });
  await page.route('**/api/reveal-special-card', (route) => {
    drawState.current = guestData({
      guest: { ...guest, participation_mode: 'HONOR_GUEST', team: '家人组', role: 'guest', eligible_for_mission: false, eligible_for_secret_role: false, special_card_title: '一路相伴', special_card_body: '谢谢你一直守护着这个家，也见证两个人走到今天。', special_card_revealed_at: '2026-08-01T13:40:00.000Z' },
      assignments: [], clues: [], phaseTwo: null,
    });
    return route.fulfill({ json: { revealedAt: '2026-08-01T13:40:00.000Z' } });
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '抽取我的惊喜卡' })).toBeVisible();
  await page.getByRole('button', { name: '抽取我的惊喜卡' }).click();
  await expect(page.getByText('一路相伴', { exact: true })).toBeVisible();
  await screenshot(page, '12d-family-honor-card', testInfo.project.name);

  drawState.current = guestData({
    game: { ...game, stage: 'group_game', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('photo-1', couplePhotoTask, 'approved', { completion_rank: 2, early_bonus_points: 1, reward_task_id: 'upgrade-1', reward_clue_id: 'clue-1' })],
    clues: [{ id: 'clue-1', title: '被忽略的细节', content: '恶作剧者完成任务时，也可能表现得非常积极。', group: '海岛组线索' }],
    pointLedger: [{ id: 'ledger-3', label: couplePhotoTask.title, amount: 2, createdAt: '2026-08-01T12:30:00.000Z' }, { id: 'ledger-4', label: '首轮前完成奖励', amount: 1, createdAt: '2026-08-01T12:31:00.000Z' }],
    teamScores: [{ team: '海岛组', points: 8 }, { team: '沙漠组', points: 6 }],
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByRole('heading', { name: '团队实时积分' })).toBeVisible();
  await expect(page.getByText('被忽略的细节')).toBeVisible();
  await screenshot(page, '12e-team-score-clue-reward', testInfo.project.name);
  await page.getByRole('button', { name: '收下这份荣誉' }).click();
  await expect(page.locator('.reward-chip')).toContainText('第 2 位通过首轮核验');
  await screenshot(page, '12h-early-honor-badge', testInfo.project.name);

  await page.getByRole('button', { name: /查看今日菜单/ }).click();
  await expect(page.getByRole('img', { name: /婚宴菜单/ })).toBeVisible();
  await screenshot(page, '13-dinner-menu', testInfo.project.name);
  await page.getByRole('button', { name: '看完菜单 · 返回游戏' }).click();

  const tricksterSignal = officialTask('P1-TRICKSTER-001');
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
  await page.getByRole('button', { name: '可疑宾客 A' }).click();
  await expect(page.getByText('已选择：可疑宾客 A')).toBeVisible();
  await screenshot(page, '16b-vote-confirmation', testInfo.project.name);

  drawState.current = guestData({
    guest: { ...guest, role: 'spy', name: '刘俊恒 Junheng Liu' },
    game: { ...game, stage: 'voting', registration_open: false, voting_open: true, voting_round: 1, phase_one_completed_at: '2026-08-01T13:00:00.000Z', team_clues_settled_at: '2026-08-01T14:30:00.000Z' },
    assignments: [assignment('facade-1', couplePhotoTask), assignment('signal-1', tricksterSignal, 'approved')],
    candidates: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组' }, { id: 'suspect-2', name: '可疑宾客 B', team: '海岛组' }],
    missionStory: { ...baseStory, relationships: [{ id: 'trickster-pair', type: 'TRICKSTER_CONNECTION', status: 'ACTIVE', partnerName: '另一位恶作剧者', confirmedByMe: true, confirmedByPartner: true, activatedAt: '2026-08-01T13:20:00.000Z' }] },
    phaseTwo: { mission: 'TRICKSTER', extraVote: true, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 0, luckySettled: false, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await page.getByRole('button', { name: '展开查看' }).click();
  await expect(page.getByText('额外一票已解锁', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '谁是恶作剧者？' })).toBeVisible();
  await screenshot(page, '16c-trickster-weighted-vote', testInfo.project.name);

  const finale = {
    tricksters: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组', escaped: false }, { id: 'spy-2', name: '另一位恶作剧者', team: '沙漠组', escaped: true }],
    voteCounts: [{ id: 'suspect-1', name: '可疑宾客 A', team: '海岛组', votes: 3, voters: [{ id: 'v1', name: '玩家甲', team: '海岛组', votes: 2 }, { id: 'v2', name: '玩家乙', team: '海岛组', votes: 1 }] }],
  };
  drawState.current = guestData({
    game: { ...game, stage: 'results', registration_open: false, voting_open: false, voting_round: 1, results_visible: true, scoreboard_visible: true, phase_one_completed_at: '2026-08-01T13:00:00.000Z', team_clues_settled_at: '2026-08-01T14:30:00.000Z', team_score_snapshot: { 海岛组: 13, 沙漠组: 20 } },
    existingVote: 'suspect-1',
    results: { ...finale, votedTargetId: 'suspect-1', votedTargetName: '可疑宾客 A', voteCorrect: true, teamCaught: true, bonusPoints: 2 },
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await screenshot(page, '17-guest-results', testInfo.project.name);
});

test('@mobile-review 23 项正式任务逐项视觉矩阵', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const state = await routeGuestData(page, guestData());
  for (const [index, task] of OFFICIAL_TASK_MANIFEST.entries()) {
    state.current = taskVisualState(task, index);
    if (index === 0) await page.goto('/guest');
    else await page.reload();
    await dismissNotice(page);

    const isSpyTask = ['P1-TRICKSTER-001', 'P2-TRICKSTER-001', 'P2-POWER-001'].includes(task.mission_code);
    if (isSpyTask) {
      await page.getByRole('button', { name: '展开查看' }).click();
      await expect(page.getByText('真实界面已展开')).toBeVisible();
    }

    const completedToggle = page.locator('.completed-missions-toggle');
    if (await completedToggle.isVisible().catch(() => false)) await completedToggle.click();
    await expandFirstMission(page);
    const missionCard = page.locator('#guest-missions details').filter({ hasText: task.title }).first();
    await expect(missionCard).toBeVisible();
    if (['P2-HEART-001', 'P2-STAR-001'].includes(task.mission_code)) {
      await expect(missionCard).toContainText('积分规则 · 必须秘密选择，不能商量');
      await expect(missionCard.getByRole('button', { name: '确认提交 · 不可修改' })).toBeDisabled();
    } else {
      await expect(missionCard).toContainText(task.verification_method);
    }

    if (['P1-CER-001', 'P1-CER-002', 'P1-CER-003', 'P1-CER-004', 'P2-CEREMONY-001'].includes(task.mission_code)) {
      await expect(missionCard.getByRole('button', { name: '我已完成 · 提交验证' })).toBeVisible();
    }
    if (['P2-SOCIAL-003', 'P2-SOCIAL-004'].includes(task.mission_code)) {
      await expect(missionCard.getByRole('button', { name: '请先上传主题合影' })).toBeDisabled();
    }

    await screenshot(page, `30-task-${task.mission_code.toLowerCase()}`, testInfo.project.name);
  }
});

test('@mobile-review 任务状态层级与驳回恢复视觉核验', async ({ page }, testInfo) => {
  const state = await routeGuestData(page, guestData({
    game: { ...game, stage: 'ceremony_end', registration_open: false },
    assignments: [
      assignment('status-rejected', officialTask('P1-SOCIAL-002'), 'rejected', { rejection_reason: '照片中没有同时看到新郎和新娘，请补拍后再次提交。', completion_note: '已经上传一张现场照片。' }),
      assignment('status-current', officialTask('P1-CER-002'), 'assigned'),
      assignment('status-waiting', officialTask('P1-CER-003'), 'submitted', { completion_note: '已在主持人提示后完成应援。' }),
      assignment('status-complete', officialTask('P1-SOCIAL-001'), 'approved', { verification_note: '任务站已核验合影与双方确认。' }),
    ],
  }));
  await page.goto('/guest');
  await dismissNotice(page);
  await expect(page.locator('.mission-list-label.current')).toContainText('现在需要处理');
  await expect(page.locator('.mission-list-label.waiting')).toContainText('等待工作人员审核');
  await expect(page.locator('#guest-missions details').first()).toHaveAttribute('open', '');
  await expect(page.locator('#guest-missions details').first()).toContainText('任务站留言');
  await expect(page.getByRole('button', { name: '补充完成 · 再次提交' })).toBeVisible();
  await expect(page.getByText('等待审核', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /已完成任务（1）/ })).toBeVisible();
  await screenshot(page, '31-task-status-hierarchy', testInfo.project.name);

  state.current = guestData({
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('speech-submitted', officialTask('P2-CEREMONY-001'), 'submitted', { completion_note: '已在主持人安排的时间完成两分钟致辞。' })],
  });
  await page.reload();
  await dismissNotice(page);
  await expandFirstMission(page);
  await expect(page.locator('#guest-missions details').first()).toContainText('等待审核');
  await expect(page.locator('#guest-missions details').first()).toContainText('我的完成说明');
  await screenshot(page, '32-dinner-speech-submitted', testInfo.project.name);
});

test('@mobile-review 公开与秘密角色逐项视觉矩阵', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const roleCases = [
    { file: '40-role-wedding-guardian', title: '婚礼守护者', taskCode: 'P1-SOCIAL-002', storyRole: 'NONE' },
    { file: '40b-role-officiant', title: '誓词引导人', taskCode: STORY_ROLE_TASKS.OFFICIANT, storyRole: 'OFFICIANT', public: true },
    { file: '40c-role-ring-keeper', title: '戒指守护者', taskCode: STORY_ROLE_TASKS.RING_KEEPER, storyRole: 'RING_KEEPER', public: true },
    { file: '40d-role-groom-cheerleader', title: '新郎应援者', taskCode: STORY_ROLE_TASKS.GROOM_CHEERLEADER, storyRole: 'GROOM_CHEERLEADER', public: true },
    { file: '40e-role-bride-cheerleader', title: '新娘应援者', taskCode: STORY_ROLE_TASKS.BRIDE_CHEERLEADER, storyRole: 'BRIDE_CHEERLEADER', public: true },
    { file: '40f-role-heart-holder', title: '爱心寻觅者', taskCode: STORY_ROLE_TASKS.HEART_HOLDER, storyRole: 'HEART_HOLDER' },
    { file: '40g-role-star-holder', title: '星光寻觅者', taskCode: STORY_ROLE_TASKS.STAR_HOLDER, storyRole: 'STAR_HOLDER' },
    { file: '40h-role-trickster-truth', title: '丘比特的恶作剧者', taskCode: 'P1-TRICKSTER-001', storyRole: 'NONE', spy: true },
  ];
  const state = await routeGuestData(page, guestData());
  for (const [index, roleCase] of roleCases.entries()) {
    const task = officialTask(roleCase.taskCode);
    const symbolPairing = roleCase.storyRole === 'HEART_HOLDER'
      ? { symbol: 'HEART', status: 'AVAILABLE', fragmentSide: 'LEFT', pendingRelationshipId: null, finalizedAt: null }
      : roleCase.storyRole === 'STAR_HOLDER'
        ? { symbol: 'STAR', status: 'AVAILABLE', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: null }
        : null;
    state.current = guestData({
      guest: { ...guest, role: roleCase.spy ? 'spy' : 'guest', story_role: roleCase.storyRole },
      game: { ...game, stage: 'ceremony_end', registration_open: false },
      assignments: [assignment(`role-${index}`, task)],
      missionStory: { ...baseStory, symbolPairing },
    });
    if (index === 0) await page.goto('/guest');
    else await page.reload();
    await dismissNotice(page);
    if (!roleCase.public) await page.getByRole('button', { name: '展开查看' }).click();
    await expect(page.getByText(roleCase.title, { exact: true }).first()).toBeVisible();
    await screenshot(page, roleCase.file, testInfo.project.name);
  }

  state.current = guestData({
    guest: { ...guest, participation_mode: 'HONOR_GUEST', team: '家人组', eligible_for_mission: false, eligible_for_secret_role: false, special_card_title: '一路相伴', special_card_body: '谢谢你一直守护着这个家。', special_card_revealed_at: '2026-08-01T13:40:00.000Z' },
    game: { ...game, stage: 'banquet', registration_open: false }, assignments: [], phaseTwo: null,
  });
  await page.reload();
  await expect(page.getByText('家庭荣誉宾客', { exact: true })).toBeVisible();
  await screenshot(page, '40i-role-family-honor-guest', testInfo.project.name);
});

test('@desktop-review 工作人员与公开终局视觉旅程', async ({ page }, testInfo) => {
  const staffGuest = { ...guest, login_name: 'qianyi wang', claimed_at: '2026-08-01T11:00:00.000Z', team_locked: true, role_locked: false, table_label: 'A1', is_elder: false, ceremony_eligible: false, active: true, staff_notes: '', uses_app: true, phase_two_eligible: true };
  const finalePersonal = Array.from({ length: 12 }, (_, index) => ({ id: `p-${index}`, name: index === 11 ? '家人嘉宾' : `宾客 ${index + 1}`, team: index === 11 ? '家人组' : index % 2 ? '海岛组' : '沙漠组', points: 18 - index, completedTasks: 2, undetectedTrickster: index === 0 }));
  const finale = { tricksters: [{ id: 'p-0', name: '宾客 1', team: '沙漠组', escaped: true }], voteCounts: [{ id: 'p-0', name: '宾客 1', team: '沙漠组', votes: 3, voters: [{ id: 'v1', name: '宾客 3', team: '沙漠组', votes: 2 }, { id: 'v2', name: '宾客 5', team: '沙漠组', votes: 1 }] }] };
  const emptyReset = { claimed_guests: 10, drawn_guests: 8, assignments: 12, evidence_files: 2, avatar_files: 7, votes: 0, guest_clues: 0, personal_ledger_entries: 9, team_ledger_entries: 2, spy_ledger_entries: 0, resource_ledger_entries: 0, registration_open: true, voting_open: false, scoreboard_visible: false };
  const adminData = {
    health: { database: 'online', checkedAt: '2026-08-01T14:05:00.000Z', deploymentVersion: 'visual-review' },
    guests: [staffGuest], assignments: [], tasks: [], clues: [], submissions: [], votes: [], pointLedger: [], auditLog: [], awards: [], teamPointLedger: [], resultRewards: [], hiddenTaskCodes: [], heartSlots: [], playerRelationships: [], symbolPairings: [], phaseTwoProfiles: [],
    game: { ...game, stage: 'registration' }, rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
    settledTeamClueIds: { '海岛组': [], '沙漠组': [] },
    storageReconciliationFailed: false,
    preflight: { ready: true, blockedCount: 0, items: [
      { id: 'roster', label: '32 位宾客与 32 个登录账号', detail: '名单与组别已经确认', status: 'ready' },
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

  adminState.current = {
    ...adminState.current,
    game: { ...game, stage: 'results', registration_open: false, voting_open: false, voting_round: 1, results_visible: true, scoreboard_visible: true, team_clues_settled_at: '2026-08-01T14:30:00.000Z', team_score_snapshot: { 海岛组: 13, 沙漠组: 20 } },
    votes: [
      { id: 'vote-1', vote_weight: 2, voter: { name: '宾客 3', team: '沙漠组' }, target: { name: '宾客 1', team: '沙漠组' } },
      { id: 'vote-2', vote_weight: 1, voter: { name: '宾客 5', team: '沙漠组' }, target: { name: '宾客 1', team: '沙漠组' } },
    ],
  };
  await page.reload();
  await page.locator('.admin-panel-tabs').getByRole('button', { name: '终局结算', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整最终个人积分排名' })).toBeVisible();
  await screenshot(page, '22b-admin-published-results', testInfo.project.name);

  const hostData = {
    guests: [{ ...guest, name: '王倩怡', special_card_title: '' }, { ...guest, id: 'spy-host', name: '恶作剧者', role: 'spy', team: '沙漠组', special_card_title: '' }, { ...guest, id: 'family-host', name: '家人嘉宾', team: '家人组', participation_mode: 'HONOR_GUEST', phase_two_eligible: false, eligible_for_personal_score: true, special_card_title: '一路相伴', special_card_revealed_at: '2026-08-01T13:40:00.000Z' }],
    teamPoints: [{ id: 1, team: '海岛组', amount: 8, reason: '团队挑战' }], personalPoints: [],
    ceremonyAssignments: [
      { id: 'host-ring', status: 'assigned', ceremony_status: 'PENDING', ring_variant: null, guest: { id: 'ring-guest', name: '金星澄 Xingcheng Jin' }, task: { title: '戒指守护者', mission_code: 'P1-CER-002', category: 'ceremony' } },
      { id: 'host-speech', status: 'submitted', ceremony_status: 'PENDING', ring_variant: null, guest: { id: 'speech-guest', name: '晚宴致辞宾客 Speech Guest' }, task: { title: '晚宴致辞人', mission_code: 'P2-CEREMONY-001', category: 'ceremony' } },
      { id: 'host-officiant', status: 'approved', ceremony_status: 'COMPLETED', ring_variant: null, guest: { id: 'officiant-guest', name: '誓词引导宾客' }, task: { title: '誓词引导人', mission_code: 'P1-CER-001', category: 'ceremony' } },
    ],
    game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null, rehearsal_run_id: '00000000-0000-4000-8000-000000000023' },
    voteCount: 0, teamClueCounts: { 海岛组: 2, 沙漠组: 2 }, rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
  };
  const hostState = { current: hostData };
  const hostGameData = {
    quickQuiz: [{ id: 'world-capitals', title: '世界首都', questions: [
      { prompt: '法国的首都是哪里？', answer: '巴黎', backup: false },
      { prompt: '日本的首都是哪里？', answer: '东京', backup: false },
      { prompt: '意大利的首都是哪里？', answer: '罗马', backup: false },
      { prompt: '泰国的首都是哪里？', answer: '曼谷', backup: false },
      { prompt: '埃及的首都是哪里？', answer: '开罗', backup: false },
      { prompt: '加拿大的首都是哪里？', answer: '渥太华', backup: false },
      { prompt: '澳大利亚的首都是哪里？', answer: '堪培拉', backup: false },
      { prompt: '巴西的首都是哪里？', answer: '巴西利亚', backup: false },
      { prompt: '土耳其的首都是哪里？', answer: '安卡拉', backup: false },
      { prompt: '新西兰的首都是哪里？', answer: '惠灵顿', backup: false },
      { prompt: '葡萄牙的首都是哪里？', answer: '里斯本', backup: true },
      { prompt: '挪威的首都是哪里？', answer: '奥斯陆', backup: true },
    ] }],
    charades: [{ id: 'wedding', title: '婚礼与爱情', words: ['交换戒指', '抛捧花', '求婚', '接亲', '敬酒', '婚礼誓词'] }],
  };
  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostState.current }));
  await page.route('**/api/host-games', (route) => route.fulfill({ json: hostGameData }));
  await page.goto('/host');
  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await screenshot(page, '23a-host-overview', testInfo.project.name);
  await expect(page.getByRole('heading', { name: '仪式任务确认' })).toBeVisible();
  await expect(page.getByText('宾客已提交 · 等待主持人确认')).toBeVisible();
  await page.getByLabel('金星澄 Xingcheng Jin负责的戒指').selectOption('GROOM_RING');
  await screenshot(page, '23f-host-ceremony-confirmation', testInfo.project.name);
  await page.getByRole('button', { name: '团队计分', exact: true }).click();
  await screenshot(page, '23c-host-team-score', testInfo.project.name);
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await screenshot(page, '23d-host-personal-score', testInfo.project.name);
  await page.getByRole('button', { name: '主持游戏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '现场游戏助手' })).toBeVisible();
  await screenshot(page, '23g-host-quick-quiz', testInfo.project.name);
  await page.getByRole('button', { name: /你比划我猜/ }).click();
  await screenshot(page, '23h-host-charades', testInfo.project.name);
  await page.getByRole('button', { name: /田忌赛马/ }).click();
  await screenshot(page, '23i-host-random-number', testInfo.project.name);
  hostState.current = { ...hostData, game: { ...hostData.game, stage: 'task_round_2' } };
  await page.reload();
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await screenshot(page, '23-host-console', testInfo.project.name);
  await page.getByText('婚宴开始', { exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: '确认切换婚礼流程' })).toBeVisible();
  await screenshot(page, '23e-host-stage-confirmation', testInfo.project.name);
  await page.getByRole('button', { name: '取消', exact: true }).click();

  hostState.current = {
    ...hostData,
    game: { stage: 'results', voting_open: false, voting_round: 1, results_visible: true, team_clues_settled_at: '2026-08-01T14:30:00.000Z' },
    finalLocked: true,
    voteCount: 10,
    rankings: { personal: finalePersonal, teams: [{ team: '沙漠组', points: 20 }, { team: '海岛组', points: 13 }] },
    finale,
  };
  await page.reload();
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整最终积分排名' })).toBeVisible();
  await screenshot(page, '23b-host-published-results', testInfo.project.name);

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
    teams: [{ team: '沙漠组', points: 20, completedTasks: 12, guests: 10 }, { team: '海岛组', points: 13, completedTasks: 11, guests: 10 }],
    leaders: finalePersonal, voteCounts: finale.voteCounts,
    revealedRoles: finale.tricksters.map((item) => ({ ...item, role: 'spy', is_hidden_spy: false })), awards: [],
  } }));
  await page.goto('/scoreboard');
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await screenshot(page, '25-public-finale', testInfo.project.name);
});
