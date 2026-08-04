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
  missionStory: { playerCode: 'K7M4', unlockedRole: '', symbolPairing: null, relationships: [], tricksterAttemptsUsed: 0, tricksterMaxAttempts: 5, mutualConfirmations: [], allianceClue: null },
  phaseTwo: null,
};

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
  allianceClues: [], symbolPairings: [], phaseTwoProfiles: [], game,
  rankings: { personal: [], teams: [] }, finale: { tricksters: [], voteCounts: [] },
  preflight: { ready: true, blockedCount: 0, items: [{ id: 'roster', label: '宾客名单', detail: '已完成', status: 'ready' }] },
  rehearsalResetPreview: emptyResetPreview,
};

const hostData = {
  guests: [{ ...guest, special_card_title: '' }], teamPoints: [], personalPoints: [],
  game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null },
  voteCount: 0, teamClueCounts: { 海岛组: 0, 沙漠组: 0 }, rankings: { personal: [], teams: [] },
  finale: { tricksters: [], voteCounts: [] },
};

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function acknowledgeGuestActivity(page) {
  const notice = page.getByRole('dialog').filter({ hasText: /欢迎回到婚礼任务|新的活动|任务收到更新|命运/ });
  if (await notice.isVisible().catch(() => false)) {
    await notice.getByRole('button', { name: /知道了 · 查看更新|接受我的新命运 · 查看能力/ }).click();
  }
}

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
  await page.route('**/api/e2e-avatar-upload', (route) => {
    const bytes = route.request().postDataBuffer();
    uploadedAvatarSignature = bytes ? {
      size: bytes.length,
      head: [...bytes.subarray(0, 16)],
      tail: [...bytes.subarray(Math.max(0, bytes.length - 16))],
    } : null;
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/guest');
  await acknowledgeGuestActivity(page);
  await expect(page.getByRole('heading', { name: /拍一张开心的/ })).toBeVisible();
  await page.getByRole('button', { name: /打开自拍相机/ }).click();
  const liveCamera = page.getByLabel('实时自拍取景画面');
  await expect(liveCamera).toBeVisible();
  await expect.poll(() => liveCamera.evaluate((video) => video.videoWidth)).toBeGreaterThan(0);
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
  const originalSides = await readPreviewSides();
  expect(originalSides.left[0]).toBeGreaterThan(originalSides.left[2]);
  expect(originalSides.right[2]).toBeGreaterThan(originalSides.right[0]);
  const firstPreviewUrl = await previewImage.getAttribute('src');
  await page.getByRole('button', { name: '照片左右反了？点此翻转' }).click();
  await expect.poll(() => previewImage.getAttribute('src')).not.toBe(firstPreviewUrl);
  const mirroredSides = await readPreviewSides();
  expect(mirroredSides.left[2]).toBeGreaterThan(mirroredSides.left[0]);
  expect(mirroredSides.right[0]).toBeGreaterThan(mirroredSides.right[2]);
  await page.getByRole('button', { name: '照片左右反了？点此翻转' }).click();
  await expect.poll(async () => (await previewImage.getAttribute('src')) !== firstPreviewUrl && (await readPreviewSides()).left[0] > (await readPreviewSides()).left[2]).toBe(true);
  const approvedAvatarSignature = await previewImage.evaluate(async (image) => {
    const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
    return {
      size: bytes.length,
      head: [...bytes.slice(0, 16)],
      tail: [...bytes.slice(Math.max(0, bytes.length - 16))],
    };
  });
  await page.getByRole('button', { name: '就用这张 · 进入婚礼游戏' }).click();
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
  await expect(settingModules).toHaveCount(4);
  for (const title of ['任务库管理', '团队线索库', '自由图案配对', '隐藏任务实体卡']) {
    const module = settingModules.filter({ hasText: title });
    await expect(module).not.toHaveAttribute('open', '');
  }
  const taskLibrary = settingModules.filter({ hasText: '任务库管理' });
  await taskLibrary.getByText('任务库管理', { exact: true }).click();
  await expect(taskLibrary).toHaveAttribute('open', '');
  await expect(taskLibrary.getByLabel('选择任务或新建')).toBeVisible();
  expect(errors).toEqual([]);
});

test('主持人可以进入团队、个人和流程控制台', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/host-data', (route) => route.fulfill({ json: hostData }));
  await page.goto('/host');

  await expect(page.getByRole('heading', { name: '主持人流程台' })).toBeVisible();
  await page.getByRole('button', { name: '团队加分', exact: true }).click();
  await expect(page.getByRole('heading', { name: '给团队加分' })).toBeVisible();
  await page.getByRole('button', { name: '个人加分', exact: true }).click();
  await expect(page.getByRole('heading', { name: '给宾客个人加分' })).toBeVisible();
  await page.getByRole('button', { name: '流程控制', exact: true }).click();
  await expect(page.getByRole('heading', { name: '婚礼流程控制' })).toBeVisible();
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
