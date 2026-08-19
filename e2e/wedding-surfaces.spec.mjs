import { expect, test } from '@playwright/test';

const game = {
  registration_open: false,
  stage: 'group_game',
  voting_open: false,
  voting_round: 0,
  results_visible: false,
  scoreboard_visible: false,
  phase_note: null,
  display_title: null,
  display_body: null,
  public_clue: null,
  timer_ends_at: null,
  invitation_code_updated_at: '2026-08-01T12:00:00.000Z',
  task_catalog_mode: 'live',
  trickster_max_attempts: 5,
  phase_one_completed_at: '2026-08-01T13:00:00.000Z',
  team_clues_settled_at: null,
  updated_at: '2026-08-01T14:00:00.000Z',
};

const guest = {
  id: 'guest-1', name: '测试宾客', team: '海岛组', role: 'guest', is_hidden_spy: false,
  points: 2, drawn_at: '2026-08-01T12:00:00.000Z', special_card_revealed_at: null,
  participation_mode: 'ACTIVE_PLAYER', relationship: '', story_role: 'NONE',
  eligible_for_mission: true, eligible_for_secret_role: true, eligible_for_personal_score: true,
  special_card_title: '', special_card_body: '', player_code: 'K7M4', unlocked_role: '',
  avatar_path: 'guest-1/avatar.jpg', avatar_uploaded_at: '2026-08-01T11:30:00.000Z',
  avatar_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23eadbd2"/%3E%3C/svg%3E',
};

const task = {
  title: '拍摄一张新郎新娘同框的照片', description: '在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。',
  verification_method: '向任务站出示合影。', points: 2, category: 'standard', stage: 'task_round_1',
  mission_code: 'P1-SOCIAL-002', mechanic: 'PHOTO', score_policy: 'STANDARD',
};

const guestData = {
  guest,
  assignments: [{ id: 'assignment-1', status: 'assigned', is_initial: true, completion_rank: null, early_bonus_points: 0, reward_task_id: null, reward_clue_id: null, completion_note: '', verification_note: '', verified_at: null, evidence_uploaded_at: null, evidence_url: null, rejection_reason: null, task }],
  clues: [], game, candidates: [], existingVote: null, pointLedger: [],
  teamScores: [{ team: '海岛组', points: 3 }, { team: '沙漠组', points: 2 }], results: null,
  missionStory: { playerCode: 'K7M4', unlockedRole: '', symbolPairing: null, relationships: [], tricksterAttemptsUsed: 0, tricksterMaxAttempts: 5, mutualConfirmations: [] },
  phaseTwo: null,
};

async function expandFirstMission(page) {
  const mission = page.locator('#guest-missions details').first();
  if ((await mission.getAttribute('open')) === null) await mission.locator('summary').click();
}

const emptyResetPreview = {
  claimed_guests: 0, drawn_guests: 0, assignments: 0, evidence_files: 0, avatar_files: 0, votes: 0,
  guest_clues: 0, personal_ledger_entries: 0, team_ledger_entries: 0,
  spy_ledger_entries: 0, resource_ledger_entries: 0, registration_open: false,
  voting_open: false, scoreboard_visible: false,
};

const adminData = {
  health: { database: 'online', checkedAt: '2026-08-01T14:05:00.000Z', deploymentVersion: 'e2e-rehearsal' },
  guests: [{ ...guest, login_name: 'test guest', claimed_at: '2026-08-01T11:00:00.000Z', team_locked: true, role_locked: false, table_label: 'A1', is_elder: false, ceremony_eligible: false, active: true, staff_notes: '', uses_app: true, phase_two_eligible: true }],
  assignments: [], tasks: [], clues: [], submissions: [], votes: [], pointLedger: [], auditLog: [], awards: [],
  teamPointLedger: [], resultRewards: [], hiddenTaskCodes: [], heartSlots: [], playerRelationships: [],
  symbolPairings: [], phaseTwoProfiles: [], game,
  rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
  settledTeamClueIds: { '海岛组': [], '沙漠组': [] },
  storageReconciliationFailed: false,
  preflight: { ready: true, blockedCount: 0, items: [{ id: 'roster', label: '宾客名单', detail: '已完成', status: 'ready' }] },
  rehearsalResetPreview: emptyResetPreview,
};

const hostData = {
  guests: [{ ...guest, special_card_title: '' }], teamPoints: [], personalPoints: [],
  ceremonyAssignments: [],
  game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null },
  voteCount: 0, teamClueCounts: { 海岛组: 0, 沙漠组: 0 }, rankings: { personal: [], teams: [] },
  finale: { tricksters: [], voteCounts: [] },
};

const hostGameData = {
  quickQuiz: [{ id: 'world-capitals', title: '世界首都', questions: [
    { prompt: '法国的首都是哪里？', answer: '巴黎', backup: false },
    { prompt: '日本的首都是哪里？', answer: '东京', backup: false },
    { prompt: '葡萄牙的首都是哪里？', answer: '里斯本', backup: true },
    { prompt: '挪威的首都是哪里？', answer: '奥斯陆', backup: true },
  ] }],
  charades: [{ id: 'wedding', title: '婚礼与爱情', words: ['交换戒指', '抛捧花', '求婚'] }],
  coupleQuiz: [
    { id: 1, prompt: '谁更喜欢梅西？', answer: null },
    { id: 2, prompt: '谁先表白？', answer: '新郎' },
  ],
};

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectCompactViewportSafe(page, label) {
  await expect.poll(async () => page.evaluate(() => ({
    overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    clippedControls: [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
          && (rect.left < -1 || rect.right > window.innerWidth + 1);
      })
      .map((element) => (element.textContent || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 80)),
  })), { message: `${label} must fit a 320px viewport` }).toEqual({ overflow: 0, clippedControls: [] });
}

async function expectAccessibleUiBasics(page, label) {
  await expect.poll(async () => page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean);
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    const unlabeledControls = [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        if (getComputedStyle(element).display === 'none' || rect.width === 0 || rect.height === 0) return false;
        const text = (element.textContent || '').trim();
        const explicitName = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.getAttribute('title');
        const labels = 'labels' in element ? [...element.labels].map((item) => item.textContent || '').join('').trim() : '';
        return !text && !explicitName && !labels;
      })
      .map((element) => `${element.tagName.toLowerCase()}#${element.id || '(no-id)'}`);
    const imagesWithoutAlt = [...document.querySelectorAll('img:not([alt])')]
      .map((element) => element.getAttribute('src') || '(unknown image)');
    return { duplicateIds, unlabeledControls, imagesWithoutAlt };
  }), { message: `${label} must keep basic accessible names and unique ids` }).toEqual({
    duplicateIds: [], unlabeledControls: [], imagesWithoutAlt: [],
  });
}

async function acknowledgeGuestActivity(page) {
  const notice = page.getByRole('dialog').filter({ hasText: /欢迎回到婚礼任务|新的活动|任务收到更新|命运/ });
  const appeared = await notice.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await notice.getByRole('button', { name: /知道了 · 查看更新|接受我的新命运 · 查看能力|收下结果 · 返回任务/ }).click();
  await expect(notice).toBeHidden();
}

test('320px 小屏仍可安全使用首页、宾客页和三个工作人员入口', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 320, height: 568 });

  await page.goto('/');
  await expect(page.getByRole('link', { name: /领取我的秘密身份/ })).toBeVisible();
  await expectCompactViewportSafe(page, '首页');
  await expectAccessibleUiBasics(page, '首页');

  await page.route('**/api/guest-me', (route) => route.fulfill({ json: guestData }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await expectCompactViewportSafe(page, '宾客页');
  await expectAccessibleUiBasics(page, '宾客页');

  await page.unroute('**/api/guest-me');
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: {
    ...guestData,
    guest: { ...guest, id: 'guest-long-name', name: '陈天然和陈子宥 Tianran Chen & Ziyou Chen', team: '家人组', points: 123 },
    assignments: [{
      ...guestData.assignments[0], id: 'assignment-long-name',
      task: { ...task, title: '拍摄一张新郎新娘与第一次见面的朋友共同入镜的幸福合影' },
    }],
  } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expect(page.getByText('陈天然和陈子宥 Tianran Chen & Ziyou Chen')).toBeVisible();
  await expectCompactViewportSafe(page, '超长姓名与任务宾客页');
  await expectAccessibleUiBasics(page, '超长姓名与任务宾客页');

  for (const path of ['/admin', '/host', '/station']) {
    await page.unroute('**/api/guest-me');
    await page.goto(path);
    await expect(page.getByLabel('管理员密码')).toBeVisible();
    await expectCompactViewportSafe(page, `${path} 登录页`);
    await expectAccessibleUiBasics(page, `${path} 登录页`);
  }

  await page.route('**/api/admin-data', (route) => route.fulfill({ json: adminData }));
  await page.goto('/admin');
  await expect(page.getByText('开场与宾客状态')).toBeVisible();
  await expectCompactViewportSafe(page, '主办方控制台');
  await expectAccessibleUiBasics(page, '主办方控制台');

  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostData }));
  await page.route('**/api/host-games', (route) => route.fulfill({ json: hostGameData }));
  await page.goto('/host');
  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await expectCompactViewportSafe(page, '主持人流程台');
  await expectAccessibleUiBasics(page, '主持人流程台');
  await page.getByRole('button', { name: '主持游戏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '现场游戏助手' })).toBeVisible();
  await expectCompactViewportSafe(page, '主持游戏工具');
  await expectAccessibleUiBasics(page, '主持游戏工具');

  await page.route('**/api/station-data', (route) => route.fulfill({ json: {
    guests: [{ ...guest, login_name: 'test guest', claimed_at: '2026-08-01T11:00:00.000Z', eligible_for_personal_score: true, phase_two_eligible: true }],
    assignments: guestData.assignments,
    tasks: [], clues: [], manualTaskIdsByGuest: { [guest.id]: [] }, manualTaskReasonsByGuest: { [guest.id]: '' },
    game: { ...game, rehearsal_run_id: '11111111-1111-4111-8111-111111111111', results_published_at: null, task_catalog_mode: 'live' },
    finalLocked: false,
  } }));
  await page.goto('/station');
  await expect(page.getByRole('heading', { name: '任务站' })).toBeVisible();
  await expectCompactViewportSafe(page, '丘比特任务站');
  await expectAccessibleUiBasics(page, '丘比特任务站');

  expect(errors).toEqual([]);
});

test('宾客真实主页可浏览任务、团队积分并支持桌面滚动', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: guestData }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.route('**/api/player-directory', (route) => route.fulfill({ json: { players: [{ name: '另一位宾客', playerCode: 'H2XK', avatarUrl: guest.avatar_url }] } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);

  await expect(page.getByText('测试宾客')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await expect(page.getByRole('button', { name: '更新我的玩家头像' })).toBeVisible();
  await expect(page.locator('#guest-missions').getByText('拍摄一张新郎新娘同框的照片', { exact: true })).toBeVisible();
  await expect(page.getByText('团队实时积分')).toBeVisible();
  await page.getByRole('button', { name: '宾客列表' }).click();
  await expect(page.getByRole('heading', { name: '宾客验证列表' })).toBeVisible();
  await expect(page.getByRole('img', { name: '另一位宾客的玩家头像' })).toBeVisible();
  await expect(page.getByText('H2XK')).toBeVisible();
  await page.getByRole('button', { name: '找到了 · 返回游戏' }).click();
  await page.getByRole('button', { name: /查看今日菜单/ }).click();
  const menuImage = page.getByRole('img', { name: /婚宴菜单/ });
  await expect(menuImage).toBeVisible();
  await expect.poll(() => menuImage.evaluate((image) => image.naturalWidth)).toBe(852);
  await page.getByRole('button', { name: '看完菜单 · 返回游戏' }).click();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('海岛与沙漠组在宾客主页拥有醒目且可区分的组别视觉', async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  let currentTeam = '海岛组';
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: {
    ...guestData,
    guest: { ...guestData.guest, team: currentTeam },
    teamScores: currentTeam === '海岛组'
      ? [{ team: '海岛组', points: 3 }, { team: '沙漠组', points: 2 }]
      : [{ team: '沙漠组', points: 3 }, { team: '海岛组', points: 2 }],
  } }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));

  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expect(page.locator('main.dashboard-shell.team-island')).toBeVisible();
  await expect(page.getByLabel('你的组别：海岛组')).toBeVisible();
  await expect(page.getByText('YOUR TEAM · 你的组别')).toBeVisible();
  await expect(page.locator('.guest-team-score-grid article.mine')).toContainText('海岛组');
  await expectCompactViewportSafe(page, '海岛组宾客主页');
  if (process.env.WEDDING_CAPTURE_TEAM_PREVIEW === '1') {
    await page.screenshot({ path: testInfo.outputPath('island-team-preview.png'), fullPage: true });
  }

  currentTeam = '沙漠组';
  await page.reload();
  await acknowledgeGuestActivity(page);
  await expect(page.locator('main.dashboard-shell.team-desert')).toBeVisible();
  await expect(page.getByLabel('你的组别：沙漠组')).toBeVisible();
  await expect(page.getByText('YOUR TEAM · 你的组别')).toBeVisible();
  await expect(page.locator('.guest-team-score-grid article.mine')).toContainText('沙漠组');
  await expectCompactViewportSafe(page, '沙漠组宾客主页');
  if (process.env.WEDDING_CAPTURE_TEAM_PREVIEW === '1') {
    await page.screenshot({ path: testInfo.outputPath('desert-team-preview.png'), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('离开后重新打开仍会收到升级任务结算，且双方提交前不泄露选择', async ({ page }) => {
  const dilemmaTask = {
    title: '星光抉择', description: '你与星光伙伴将面对丘比特留下的最后一道默契考验。',
    verification_method: '系统等待双方秘密提交后自动结算。', points: 0, category: 'upgrade', stage: 'task_round_2',
    mission_code: 'P2-STAR-001', mechanic: 'SECRET_DILEMMA', score_policy: 'NO_PERSONAL',
  };
  const phaseTwoBase = {
    mission: 'STAR_DILEMMA', extraVote: false, superLucky: false, isCaptain: false,
    unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 2,
    luckySettled: false, captainSettled: false, originVerified: true,
    copyChoice: null, copyCandidates: [],
  };
  const state = { current: {
    ...guestData,
    game: { ...game, stage: 'banquet' },
    assignments: [{ ...guestData.assignments[0], id: 'star-dilemma', task: dilemmaTask }],
    phaseTwo: { ...phaseTwoBase, dilemma: { allianceType: 'STAR', submitted: true, settled: false, myChoice: 'TOGETHER', partnerChoice: null, myPoints: null, partnerPoints: null } },
  } };
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: state.current }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expandFirstMission(page);
  await expect(page.getByText('你的选择已密封保存')).toBeVisible();
  await expect(page.getByText('伙伴选择')).toHaveCount(0);

  state.current = {
    ...state.current,
    assignments: [{ ...state.current.assignments[0], status: 'approved' }],
    phaseTwo: { ...phaseTwoBase, dilemma: { allianceType: 'STAR', submitted: true, settled: true, myChoice: 'TOGETHER', partnerChoice: 'TAKE_ALL', myPoints: 0, partnerPoints: 5 } },
  };
  await page.reload();
  const resultDialog = page.getByRole('dialog');
  await expect(resultDialog).toContainText('星光在岔路口分开');
  await expect(resultDialog).toContainText(/你\s*0 分/);
  await expect(resultDialog).toContainText(/伙伴\s*5 分/);
  await resultDialog.getByRole('button', { name: '收下结果 · 返回任务' }).click();
  await page.getByRole('button', { name: /已完成任务（1）/ }).click();
  await expandFirstMission(page);
  await expect(page.getByText('星光在岔路口分开')).toBeVisible();
  await expect(page.getByText('伙伴选择「独占」· 获得 5 分')).toBeVisible();
});

test('恶作剧者完成真正任务后在真实界面看到已生效的额外一票', async ({ page }) => {
  const errors = collectPageErrors(page);
  const tricksterData = {
    ...guestData,
    guest: { ...guest, role: 'spy', name: '测试恶作剧者' },
    assignments: [{
      ...guestData.assignments[0],
      id: 'trickster-signal-assignment',
      status: 'approved',
      task: {
        title: '寻找恶作剧者同伴', description: '使用秘密暗号寻找同伴。', verification_method: '恶作剧者双方确认。',
        points: 0, category: 'hidden', stage: 'task_round_1', mission_code: 'P1-TRICKSTER-001', mechanic: 'TRICKSTER_SIGNAL', score_policy: 'NO_PERSONAL',
      },
    }],
    missionStory: {
      ...guestData.missionStory,
      relationships: [{ id: 'trickster-connection', type: 'TRICKSTER_CONNECTION', status: 'ACTIVE', partnerName: '另一位恶作剧者', confirmedByMe: true, confirmedByPartner: true, activatedAt: '2026-08-01T13:00:00.000Z' }],
    },
    phaseTwo: {
      mission: 'TRICKSTER', extraVote: false, superLucky: false, isCaptain: false,
      unlockedAt: '2026-08-01T13:30:00.000Z', phaseOnePointsSnapshot: 0,
      luckySettled: false, captainSettled: false, originVerified: true,
      dilemma: null, copyChoice: null, copyCandidates: [],
    },
  };
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: tricksterData }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);

  await expect(page.getByText('额外一票已解锁')).toHaveCount(0);
  await page.getByRole('button', { name: '展开查看' }).click();
  await expect(page.getByText('额外一票已解锁', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/系统会立即将你的选择按 2 票保存/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('首次登录宾客完成婚礼自拍后才能进入游戏', async ({ page }) => {
  let avatarConfirmed = false;
  let uploadedAvatarSignature = null;
  await page.addInitScript(() => {
    const getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext('2d');
      const paintFrame = () => {
        context.fillStyle = '#ff0000'; context.fillRect(0, 0, 8, 16);
        context.fillStyle = '#0000ff'; context.fillRect(8, 0, 8, 16);
      };
      paintFrame();
      const stream = canvas.captureStream(10);
      stream.getVideoTracks()[0]?.requestFrame?.();
      window.setInterval(paintFrame, 100);
      return stream;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });
  await page.route('**/api/guest-me', (route) => route.fulfill({
    json: { ...guestData, guest: { ...guest, avatar_path: avatarConfirmed ? guest.avatar_path : null, avatar_uploaded_at: avatarConfirmed ? guest.avatar_uploaded_at : null, avatar_url: avatarConfirmed ? guest.avatar_url : null } },
  }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.route('**/api/guest-avatar', async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { path: 'guest-1/avatar.jpg', signedUrl: '/api/e2e-avatar-upload' } });
    avatarConfirmed = true;
    return route.fulfill({ json: { uploadedAt: '2026-08-01T11:30:00.000Z' } });
  });
  await page.route('**/api/e2e-avatar-upload', async (route) => {
    const bytes = route.request().postDataBuffer();
    uploadedAvatarSignature = bytes ? {
      size: bytes.length,
      head: [...bytes.subarray(0, 16)],
      tail: [...bytes.subarray(Math.max(0, bytes.length - 16))],
    } : null;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expect(page.getByRole('heading', { name: /拍一张开心的/ })).toBeVisible();
  await page.getByRole('button', { name: /打开自拍相机/ }).click();
  const liveCamera = page.getByLabel('实时自拍取景画面');
  await expect(liveCamera).toBeVisible();
  await expect.poll(() => liveCamera.evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
  await expect(liveCamera).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.getByRole('button', { name: '拍下这张' }).click();
  const previewImage = page.getByRole('img', { name: '待上传的婚礼自拍预览' });
  await expect(previewImage).toBeVisible();
  const readPreviewSides = () => previewImage.evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return {
      left: [...context.getImageData(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2), 1, 1).data],
      right: [...context.getImageData(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2), 1, 1).data],
    };
  });
  const mirroredSides = await readPreviewSides();
  expect(mirroredSides.left[2]).toBeGreaterThan(mirroredSides.left[0]);
  expect(mirroredSides.right[0]).toBeGreaterThan(mirroredSides.right[2]);
  const firstPreviewUrl = await previewImage.getAttribute('src');
  await page.getByRole('button', { name: '重新拍摄婚礼自拍' }).click();
  await expect(liveCamera).toBeVisible();
  await expect.poll(() => liveCamera.evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '拍下这张' }).click();
  await expect(previewImage).toBeVisible();
  await expect.poll(() => previewImage.getAttribute('src')).not.toBe(firstPreviewUrl);
  const secondPreviewUrl = await previewImage.getAttribute('src');
  await page.getByRole('button', { name: '照片左右反了？点此翻转' }).click();
  await expect.poll(() => previewImage.getAttribute('src')).not.toBe(secondPreviewUrl);
  const originalSides = await readPreviewSides();
  expect(originalSides.left[0]).toBeGreaterThan(originalSides.left[2]);
  expect(originalSides.right[2]).toBeGreaterThan(originalSides.right[0]);
  await page.getByRole('button', { name: '照片左右反了？点此翻转' }).click();
  await expect.poll(async () => (await previewImage.getAttribute('src')) !== secondPreviewUrl && (await readPreviewSides()).left[2] > (await readPreviewSides()).left[0]).toBe(true);
  const approvedAvatarSignature = await previewImage.evaluate(async (image) => {
    const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
    return {
      size: bytes.length,
      head: [...bytes.slice(0, 16)],
      tail: [...bytes.slice(Math.max(0, bytes.length - 16))],
    };
  });
  await page.getByRole('button', { name: '就用这张 · 进入婚礼游戏' }).click();
  await expect(page.getByRole('heading', { name: /正在安全保存/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '正在传送照片…' })).toBeVisible();
  await expect(page.getByText('请不要关闭或刷新页面')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新拍摄婚礼自拍' })).toHaveCount(0);
  await expect.poll(() => uploadedAvatarSignature).not.toBeNull();
  expect(uploadedAvatarSignature).toEqual(approvedAvatarSignature);
  await expect(page.getByText('测试宾客')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
});

test('主控四个主入口及现场二级入口均可进入', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/admin-data', (route) => route.fulfill({ json: adminData }));
  await page.goto('/admin');

  await expect(page.getByText('开场与宾客状态')).toBeVisible();
  await expect(page.getByText('系统在线')).toBeVisible();
  await expect(page.getByText(/部署 e2e-rehears/)).toBeVisible();

  const primaryNavigation = page.locator('.admin-panel-tabs');
  for (const label of ['现场执行', '终局结算', '婚礼设置', '开场与宾客']) {
    await primaryNavigation.getByRole('button', { name: label, exact: true }).click();
  }
  await expect(page.getByText('开场检查')).toBeVisible();
  await expect(page.getByRole('heading', { name: '宾客注册与游戏进度' })).toBeVisible();
  const guestDirectory = page.locator('details.guest-directory-details');
  await expect(guestDirectory).not.toHaveAttribute('open', '');
  await guestDirectory.getByText('查看宾客明细', { exact: true }).click();
  await expect(page.getByLabel('搜索宾客')).toBeVisible();
  await primaryNavigation.getByRole('button', { name: '现场执行', exact: true }).click();
  const registrationControls = page.locator('details.registration-control-card');
  await expect(registrationControls).not.toHaveAttribute('open', '');
  await registrationControls.getByText('宾客注册', { exact: true }).click();
  await expect(registrationControls.getByRole('button', { name: /注册/ })).toBeVisible();
  const invitationControls = registrationControls.locator('details.nested-action-details');
  await expect(invitationControls).not.toHaveAttribute('open', '');
  await invitationControls.getByText('更换共享邀请码', { exact: true }).click();
  await expect(registrationControls.getByLabel('新邀请码')).toBeVisible();
  const liveNavigation = page.getByRole('navigation', { name: '现场执行功能' });
  await liveNavigation.getByRole('button', { name: /任务审核/ }).click();
  await expect(page.getByRole('heading', { name: '待审核任务' })).toBeVisible();
  await primaryNavigation.getByRole('button', { name: '婚礼设置', exact: true }).click();
  const settingModules = page.locator('details.settings-module-card');
  await expect(settingModules).toHaveCount(3);
  for (const title of ['任务库管理', '团队线索库', '自由图案配对']) {
    const module = settingModules.filter({ hasText: title });
    await expect(module).not.toHaveAttribute('open', '');
  }
  const taskLibrary = settingModules.filter({ hasText: '任务库管理' });
  await taskLibrary.getByText('任务库管理', { exact: true }).click();
  await expect(taskLibrary).toHaveAttribute('open', '');
  await expect(taskLibrary.getByLabel('选择任务或新建')).toBeVisible();
  expect(errors).toEqual([]);
});

test('主持人可以进入游戏、团队、个人和流程控制台', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostData }));
  await page.route('**/api/host-games', (route) => route.fulfill({ json: hostGameData }));
  await page.goto('/host');

  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await page.getByRole('button', { name: '主持游戏', exact: true }).click();
  await expect(page.getByRole('heading', { name: '现场游戏助手' })).toBeVisible();
  await page.getByRole('button', { name: '开始海岛组答题' }).click();
  await expect(page.getByText('法国的首都是哪里？')).toBeVisible();
  await page.getByRole('button', { name: '显示答案' }).click();
  await expect(page.getByText('巴黎', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '答对 · 下一题' }).click();
  await expect(page.getByText('日本的首都是哪里？')).toBeVisible();
  await page.getByRole('button', { name: /02.*你比划我猜/ }).click();
  await expect(page.getByText('开始后显示第一词')).toBeVisible();
  await page.getByRole('button', { name: '开始 5 分钟' }).click();
  await expect(page.locator('.charades-word strong')).not.toHaveText('开始后显示第一词');
  await page.getByRole('button', { name: /03.*田忌赛马/ }).click();
  await page.getByRole('button', { name: '奖励数 1–10' }).click();
  await page.getByRole('button', { name: '随机抽取一个数字' }).click();
  await expect(page.locator('.random-result strong')).not.toHaveText('—');
  await page.getByRole('button', { name: /04.*一站到底/ }).click();
  await expect(page.getByText('尚未填写，暂不能揭晓')).toBeVisible();
  await expect(page.getByRole('button', { name: '揭晓答案' })).toBeDisabled();
  await page.getByRole('button', { name: '团队计分', exact: true }).click();
  await expect(page.getByRole('heading', { name: '记录团队挑战成绩' })).toBeVisible();
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await expect(page.getByRole('heading', { name: '给宾客个人加分' })).toBeVisible();
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await expect(page.getByRole('heading', { name: '婚礼流程控制' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('主持人只能通过服务器为随机家人增加一分且不会提交团队分', async ({ page }) => {
  const errors = collectPageErrors(page);
  const runId = '22222222-2222-4222-8222-222222222222';
  let awardRequest = null;
  const familyGuest = {
    ...guest,
    id: 'family-random-1',
    name: '家人嘉宾甲',
    team: '家人组',
    participation_mode: 'HONOR_GUEST',
    phase_two_eligible: false,
    eligible_for_personal_score: true,
    drawn_at: null,
  };
  await page.route('**/api/host-data', (route) => route.fulfill({ json: {
    ...hostData,
    guests: [familyGuest, ...hostData.guests],
    game: { ...hostData.game, rehearsal_run_id: runId, results_published_at: null },
    finalLocked: false,
  } }));
  await page.route('**/api/host-action', async (route) => {
    awardRequest = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true, award: { guest_id: familyGuest.id, guest_name: familyGuest.name, total: 6, amount: 1, replayed: false } } });
  });

  await page.goto('/host');
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await expect(page.getByText('家人组没有团队分。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '随机抽取一位 · +1 分' }).click();
  const confirmation = page.getByRole('dialog', { name: '确认家人组随机个人奖励' });
  await expect(confirmation.getByText('不会增加任何团队分。', { exact: false })).toBeVisible();
  await confirmation.getByRole('button', { name: '确认胜利并随机加分' }).click();
  await expect(page.getByText('家人组随机奖励：家人嘉宾甲 +1 分 · 当前 6 分')).toBeVisible();

  expect(awardRequest).toMatchObject({ type: 'awardRandomFamilyPoint', rehearsalRunId: runId });
  expect(awardRequest.eventKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(awardRequest).not.toHaveProperty('guestId');
  expect(awardRequest).not.toHaveProperty('amount');
  expect(awardRequest).not.toHaveProperty('reason');
  expect(errors).toEqual([]);
});

test('主控、主持人和任务站都能真实提交个人积分并携带同一安全契约', async ({ page }) => {
  const errors = collectPageErrors(page);
  const runId = '11111111-1111-4111-8111-111111111111';
  const requests = [];
  page.on('dialog', (dialog) => dialog.accept());
  await page.route('**/api/admin-action', async (route) => {
    const body = route.request().postDataJSON();
    requests.push({ surface: 'staff', body });
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/host-action', async (route) => {
    const body = route.request().postDataJSON();
    requests.push({ surface: 'host', body });
    await route.fulfill({ json: { ok: true, total: 4 } });
  });

  const liveGame = { ...game, rehearsal_run_id: runId, results_published_at: null };
  await page.route('**/api/admin-data', (route) => route.fulfill({ json: { ...adminData, game: liveGame, finalLocked: false } }));
  await page.goto('/admin');
  await page.locator('.admin-panel-tabs').getByRole('button', { name: '现场执行', exact: true }).click();
  await page.getByRole('navigation', { name: '现场执行功能' }).getByRole('button', { name: /任务审核/ }).click();
  await page.getByRole('button', { name: '调整个人积分 →' }).click();
  await page.locator('#point-amount').fill('2');
  await page.locator('#point-reason').fill('现场互动奖励');
  await page.getByRole('button', { name: '确认调整 测试宾客' }).click();
  await expect(page.getByText('个人积分已调整', { exact: true })).toBeVisible();

  await page.route('**/api/host-data', (route) => route.fulfill({ json: {
    ...hostData,
    game: { ...hostData.game, rehearsal_run_id: runId, results_published_at: null },
    finalLocked: false,
  } }));
  await page.goto('/host');
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await page.getByLabel('增加分数').fill('2');
  await page.getByLabel('加分原因').fill('主持人现场奖励');
  await page.getByRole('button', { name: '确认给测试宾客加 2 分' }).click();
  await expect(page.getByText(/测试宾客 已加 2 分 · 当前 4 分/)).toBeVisible();

  const stationData = {
    guests: [{
      id: guest.id, name: guest.name, login_name: 'test guest', team: '家人组', points: 4,
      claimed_at: '2026-08-01T11:00:00.000Z', drawn_at: null,
      eligible_for_personal_score: true, phase_two_eligible: false,
      participation_mode: 'HONOR_GUEST',
    }],
    assignments: [], tasks: [], clues: [], manualTaskIdsByGuest: { [guest.id]: [] },
    game: { stage: 'group_game', team_clues_settled_at: null, results_visible: false,
      results_published_at: null, rehearsal_run_id: runId, task_catalog_mode: 'live' },
    finalLocked: false,
  };
  await page.route('**/api/station-data', (route) => route.fulfill({ json: stationData }));
  await page.goto('/station');
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: /测试宾客/ }).click();
  await page.getByText('更多现场操作', { exact: true }).click();
  await page.getByLabel('积分变化').fill('1');
  await page.getByLabel('积分原因').fill('家人互动奖励');
  await page.getByRole('button', { name: '确认调整 测试宾客' }).click();
  await expect(page.getByText('个人积分已调整', { exact: true })).toBeVisible();

  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(request.body.rehearsalRunId).toBe(runId);
    expect(request.body.eventKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(request.body.guestId).toBe(guest.id);
    expect(request.body.amount).toBeGreaterThan(0);
    expect(request.body.reason).toBeTruthy();
  }
  expect(requests.map((request) => request.body.type)).toEqual(['adjustPoints', 'adjustGuestPoints', 'adjustPoints']);
  expect(errors).toEqual([]);
});

test('主控必须先关闭投票，并在发布前核对已投、应投与缺席人数', async ({ page }) => {
  const errors = collectPageErrors(page);
  const runId = '22222222-2222-4222-8222-222222222222';
  const current = {
    ...adminData,
    votes: [{
      id: 'vote-1', vote_weight: 1,
      voter: { name: '测试宾客', team: '海岛组' },
      target: { name: '另一位宾客', team: '海岛组' },
    }],
    game: {
      ...game,
      stage: 'voting', voting_open: true, voting_round: 1,
      results_visible: false, results_published_at: null,
      team_clues_settled_at: '2026-08-01T14:30:00.000Z',
      rehearsal_run_id: runId,
    },
  };
  const actions = [];
  await page.route('**/api/admin-data', (route) => route.fulfill({ json: current }));
  await page.route('**/api/admin-action', async (route) => {
    const body = route.request().postDataJSON();
    actions.push(body);
    if (body.type === 'toggleVoting' && body.value === false) current.game.voting_open = false;
    await route.fulfill({ json: { ok: true } });
  });

  await page.goto('/admin');
  await page.locator('.admin-panel-tabs').getByRole('button', { name: '终局结算', exact: true }).click();
  await expect(page.getByText('第 1 轮进行中 · 1/1 人已投')).toBeVisible();
  const publishWhileOpen = page.getByRole('button', { name: '请先关闭投票' });
  await expect(publishWhileOpen).toBeDisabled();

  await page.getByRole('button', { name: '关闭本轮投票' }).click();
  await page.getByRole('button', { name: '确认执行' }).click();
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({
    type: 'toggleVoting', value: false, rehearsalRunId: runId,
  });

  await page.getByRole('button', { name: '公布身份并结算个人奖励' }).click();
  const confirmation = page.getByRole('dialog', { name: '确认公布身份' });
  await expect(confirmation.getByText('本轮已投 1 人 / 应投 1 人 / 缺席 0 人。')).toBeVisible();
  await expect(confirmation.getByRole('button', { name: '确认公布并永久冻结' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('主控、主持人与公开大屏显示完整终局排名和实名投票来源', async ({ page }) => {
  const errors = collectPageErrors(page);
  const personal = [...Array.from({ length: 20 }, (_, index) => ({
    id: `final-${index + 1}`, name: `宾客${index + 1}`, team: index % 2 ? '海岛组' : '沙漠组',
    points: 20 - index, completedTasks: 2, undetectedTrickster: index === 0,
  })), { id: 'family-final', name: '家人嘉宾', team: '家人组', points: 7, completedTasks: 1, undetectedTrickster: false }];
  const finale = {
    tricksters: [{ id: 'final-1', name: '宾客1', team: '沙漠组', escaped: true }, { id: 'final-2', name: '宾客2', team: '海岛组', escaped: false }],
    voteCounts: [{ id: 'final-1', name: '宾客1', team: '沙漠组', votes: 3, voters: [
      { id: 'voter-a', name: '投票者A', team: '沙漠组', votes: 2 }, { id: 'voter-b', name: '投票者B', team: '沙漠组', votes: 1 },
    ] }],
  };
  const finalGame = { ...game, stage: 'results', voting_round: 1, results_visible: true, scoreboard_visible: true, team_clues_settled_at: '2026-08-01T14:30:00.000Z', team_score_snapshot: { 海岛组: 13, 沙漠组: 20 } };

  await page.route('**/api/public-scoreboard', (route) => route.fulfill({ json: {
    visible: true, stage: 'results', resultsVisible: true, displayTitle: null, displayBody: null, publicClue: null,
    timerEndsAt: null, updatedAt: finalGame.updated_at, teams: [], leaders: personal, voteCounts: finale.voteCounts,
    revealedRoles: finale.tricksters.map((item) => ({ ...item, role: 'spy', is_hidden_spy: false })), awards: [],
  } }));
  await page.goto('/scoreboard');
  await expect(page.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await expect(page.getByText('成功逃脱 · 完美伪装')).toBeVisible();
  await expect(page.getByText('投票者A（2票）、投票者B')).toBeVisible();
  await expect(page.getByText('婚礼守护者')).toHaveCount(0);
  await expect(page.getByText('家人嘉宾', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '家人组' })).toHaveCount(0);

  await page.route('**/api/guest-me', (route) => route.fulfill({ json: {
    ...guestData,
    game: finalGame,
    existingVote: 'final-1',
    results: {
      tricksters: finale.tricksters,
      voteCounts: finale.voteCounts,
      votedTargetId: 'final-1',
      votedTargetName: '宾客1',
      voteCorrect: true,
      teamCaught: true,
      bonusPoints: 2,
    },
  } }));
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  const guestReveal = page.locator('.reveal-card');
  await expect(guestReveal.getByRole('heading', { name: '恶作剧者揭晓' })).toBeVisible();
  await expect(guestReveal.getByText('成功逃脱', { exact: true })).toBeVisible();
  await expect(guestReveal.getByText('投票者A（2票）、投票者B')).toBeVisible();
  await expect(guestReveal.getByText('婚礼守护者', { exact: true })).toHaveCount(0);
  await expect(guestReveal.getByRole('link', { name: '查看全员最终积分排名' })).toHaveAttribute('href', '/scoreboard');

  await page.route('**/api/host-data', (route) => route.fulfill({ json: { ...hostData, game: finalGame, voteCount: 2, rankings: { personal, teams: [] }, finale } }));
  await page.goto('/host');
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整最终积分排名' })).toBeVisible();
  await expect(page.getByText('宾客20')).toBeVisible();
  await expect(page.getByText('家人嘉宾', { exact: true })).toBeVisible();

  await page.route('**/api/admin-data', (route) => route.fulfill({ json: { ...adminData, game: finalGame, rankings: { personal, teams: [] }, finale } }));
  await page.goto('/admin');
  await page.locator('.admin-panel-tabs').getByRole('button', { name: '终局结算', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完整最终个人积分排名' })).toBeVisible();
  await expect(page.getByText('投票者A（2票）、投票者B')).toBeVisible();
  await expect(page.getByText('宾客20')).toBeVisible();
  await expect(page.getByText('家人嘉宾', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('工作人员入口在窄屏保持完整并提示隐藏信息边界', async ({ page }) => {
  for (const [path, heading, privacyCopy] of [
    ['/admin', /主办方.*控制台/, '仅限主办方使用'],
    ['/host', /主持人.*流程台/, '包含隐藏身份'],
    ['/station', /丘比特.*任务站/, '面向工作人员'],
  ]) {
    await page.route(`**/api/${path === '/admin' ? 'admin-data' : path === '/host' ? 'host-data' : 'station-data'}`, (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByLabel(/婚礼地点与日期/)).toBeVisible();
    await expect(page.getByText(privacyCopy, { exact: false })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test('大屏正常加载时不显示错误重连操作', async ({ page }) => {
  await page.route('**/api/public-scoreboard', () => new Promise(() => {}));
  await page.goto('/scoreboard');
  await expect(page.getByRole('heading', { name: '丘比特正在统计' })).toBeVisible();
  await expect(page.getByLabel(/婚礼地点与日期/)).toBeVisible();
  await expect(page.getByRole('button', { name: '重新连接' })).toHaveCount(0);
});
