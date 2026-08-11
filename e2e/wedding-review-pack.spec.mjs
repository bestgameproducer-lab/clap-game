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
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) {
    const button = dialog.getByRole('button', { name: /知道了|查看更新|接受我的新命运|收下结果/ });
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
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await page.locator('#guest-missions summary').first().click();
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

  const ringTask = {
    title: '戒指守护者', description: '在工作人员提示后领取戒指盒，并在交换戒指环节送到新人身边。',
    verification_method: '由工作人员现场确认。', points: 5, category: 'ceremony', stage: 'task_round_1',
    mission_code: 'P1-CER-002', mechanic: 'STANDARD', score_policy: 'STANDARD',
  };
  drawState.current = guestData({
    guest: { ...guest, story_role: 'RING_KEEPER' },
    assignments: [assignment('ring-1', ringTask)],
  });
  await page.reload(); await dismissNotice(page);
  await expect(page.getByText('戒指守护者', { exact: true }).first()).toBeVisible();
  await screenshot(page, '08b-public-ceremony-role', testInfo.project.name);

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
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByRole('button', { name: '接受邀请' })).toBeVisible();
  await screenshot(page, '09c-pairing-invitation', testInfo.project.name);

  drawState.current = guestData({
    assignments: [assignment('star-1', starTask, 'approved')],
    missionStory: {
      ...baseStory,
      symbolPairing: { symbol: 'STAR', status: 'MATCHED', fragmentSide: 'RIGHT', pendingRelationshipId: null, finalizedAt: '2026-08-01T12:45:00.000Z' },
      relationships: [{ id: 'star-paired', type: 'STAR_ALLIANCE', status: 'ACTIVE', partnerName: '謝菲菲 Feifei Xie', confirmedByMe: true, confirmedByPartner: true, activatedAt: '2026-08-01T12:45:00.000Z' }],
    },
  });
  await page.reload(); await dismissNotice(page);
  await page.getByRole('button', { name: '查看已完成任务（1）' }).click();
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('完整星星', { exact: true })).toBeVisible();
  await screenshot(page, '09d-star-match-complete', testInfo.project.name);

  const heartTask = {
    title: '寻找爱心伙伴', description: '找到持有另一半爱心的玩家，组成丘比特联盟。',
    verification_method: '双方在软件中确认。', points: 2, category: 'standard', stage: 'task_round_1',
    mission_code: 'P1-HEART-001', mechanic: 'HEART_MATCH', score_policy: 'STANDARD',
  };
  drawState.current = guestData({
    assignments: [assignment('heart-1', heartTask)],
    missionStory: { ...baseStory, symbolPairing: { symbol: 'HEART', status: 'AVAILABLE', fragmentSide: 'LEFT', pendingRelationshipId: null, finalizedAt: null } },
  });
  await page.reload(); await dismissNotice(page);
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('左半爱心')).toBeVisible();
  await screenshot(page, '09e-heart-pairing', testInfo.project.name);

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
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByText('你没有失败，这项能力正来自那次落单')).toBeVisible();
  await screenshot(page, '11b-guiding-star-mission', testInfo.project.name);

  const lonelyTask = {
    title: '孤单丘比特', description: '选择一位竞技玩家，在最终揭晓时复制他在第二幕获得的个人积分。',
    verification_method: '锁定目标后由系统在最终揭晓时自动结算。', points: 0, category: 'upgrade', stage: 'task_round_2',
    mission_code: 'P2-LONELY-001', mechanic: 'COPY_SCORE', score_policy: 'NO_PERSONAL',
  };
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
  await page.locator('#guest-missions summary').first().click();
  await expect(page.getByLabel('选择要复制命运的玩家')).toBeVisible();
  await screenshot(page, '11d-lonely-cupid-choice', testInfo.project.name);

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

  const heartDilemmaTask = {
    ...dilemmaTask, title: '爱与恨', description: '丘比特要检验爱心联盟能否经得住诱惑。',
    mission_code: 'P2-HEART-001',
  };
  drawState.current = guestData({
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('heart-dilemma-1', heartDilemmaTask)],
    phaseTwo: { mission: 'HEART_DILEMMA', extraVote: false, superLucky: false, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2, luckySettled: false, captainSettled: false, originVerified: true, dilemma: { allianceType: 'HEART', submitted: false, settled: false, myChoice: null, partnerChoice: null, myPoints: null, partnerPoints: null }, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await page.locator('#guest-missions summary').first().click();
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

  const luckyTask = {
    title: '丘比特幸运星', description: '第二轮开启时，系统立即按你第一轮已经获得的个人积分发放同额奖励，并自动完成此任务。',
    verification_method: '系统已自动结算。', points: 0, category: 'upgrade', stage: 'task_round_2',
    mission_code: 'P2-LUCKY-001', mechanic: 'INSTANT_BONUS', score_policy: 'NO_PERSONAL',
  };
  drawState.current = guestData({
    guest: { ...guest, points: 8 },
    game: { ...game, stage: 'banquet', registration_open: false, phase_one_completed_at: '2026-08-01T13:00:00.000Z' },
    assignments: [assignment('lucky-1', luckyTask, 'approved', { verification_note: '系统已完成幸运积分翻倍。' })],
    pointLedger: [{ id: 'ledger-1', label: '第一轮任务积分', amount: 4, createdAt: '2026-08-01T12:30:00.000Z' }, { id: 'ledger-2', label: '丘比特幸运星 · 第一轮积分翻倍', amount: 4, createdAt: '2026-08-01T13:30:00.000Z' }],
    phaseTwo: { mission: 'SUPER_LUCKY', extraVote: false, superLucky: true, isCaptain: false, unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 4, luckySettled: true, captainSettled: false, originVerified: true, dilemma: null, copyChoice: null, copyCandidates: [] },
  });
  await page.reload(); await dismissNotice(page);
  await page.getByRole('button', { name: /查看我的积分流水/ }).click();
  await expect(page.getByText('丘比特幸运星 · 第一轮积分翻倍')).toBeVisible();
  await screenshot(page, '12g-lucky-star-ledger', testInfo.project.name);
  await page.getByRole('button', { name: '看清楚了 · 关闭' }).click();

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
  await expect(page.locator('.reward-chip')).toContainText('第 2 位完成首轮任务');
  await screenshot(page, '12h-early-honor-badge', testInfo.project.name);

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
      { id: 'roster', label: '34 位宾客与 33 个登录账号', detail: '名单与组别已经确认', status: 'ready' },
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
    guests: [{ ...guest, name: '王倩怡', special_card_title: '' }, { ...guest, id: 'spy-host', name: '恶作剧者', role: 'spy', team: '沙漠组', special_card_title: '' }],
    teamPoints: [{ id: 1, team: '海岛组', amount: 8, reason: '团队挑战' }], personalPoints: [],
    game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null },
    voteCount: 0, teamClueCounts: { 海岛组: 2, 沙漠组: 2 }, rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
  };
  const hostState = { current: hostData };
  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostState.current }));
  await page.goto('/host');
  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await screenshot(page, '23a-host-overview', testInfo.project.name);
  await page.getByRole('button', { name: '团队计分', exact: true }).click();
  await screenshot(page, '23c-host-team-score', testInfo.project.name);
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await screenshot(page, '23d-host-personal-score', testInfo.project.name);
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await screenshot(page, '23-host-console', testInfo.project.name);
  await page.getByText('婚宴开始', { exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: '确认切换婚礼流程' })).toBeVisible();
  await screenshot(page, '23e-host-stage-confirmation', testInfo.project.name);
  await page.getByRole('button', { name: '取消', exact: true }).click();

  hostState.current = {
    ...hostData,
    game: { stage: 'results', voting_open: false, voting_round: 1, results_visible: true, team_clues_settled_at: '2026-08-01T14:30:00.000Z' },
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
    teams: [{ team: '沙漠组', points: 20, completedTasks: 12, guestCount: 10 }, { team: '海岛组', points: 13, completedTasks: 11, guestCount: 10 }],
    leaders: finalePersonal, voteCounts: finale.voteCounts,
    revealedRoles: finale.tricksters.map((item) => ({ ...item, role: 'spy', is_hidden_spy: false })), awards: [],
  } }));
  await page.goto('/scoreboard');
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await screenshot(page, '25-public-finale', testInfo.project.name);
});
