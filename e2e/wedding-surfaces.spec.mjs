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
  claimed_guests: 0, drawn_guests: 0, assignments: 0, evidence_files: 0, votes: 0,
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
  preflight: { ready: true, blockedCount: 0, items: [{ id: 'roster', label: '宾客名单', detail: '已完成', status: 'ready' }] },
  rehearsalResetPreview: emptyResetPreview,
};

const hostData = {
  guests: [{ ...guest, special_card_title: '' }], teamPoints: [], personalPoints: [],
  game: { stage: 'group_game', voting_open: false, voting_round: 0, results_visible: false, team_clues_settled_at: null },
  voteCount: 0, teamClueCounts: { 海岛组: 0, 沙漠组: 0 }, rankings: { personal: [], teams: [] },
};

function collectPageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('宾客真实主页可浏览任务、团队积分并支持桌面滚动', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/guest-me', (route) => route.fulfill({ json: guestData }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.route('**/api/player-directory', (route) => route.fulfill({ json: { players: [{ name: '另一位宾客', playerCode: 'H2XK', avatarUrl: guest.avatar_url }] } }));
  await page.goto('/guest');

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
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('首次登录宾客完成婚礼自拍后才能进入游戏', async ({ page }) => {
  let avatarConfirmed = false;
  await page.route('**/api/guest-me', (route) => route.fulfill({
    json: { ...guestData, guest: { ...guest, avatar_path: avatarConfirmed ? guest.avatar_path : null, avatar_uploaded_at: avatarConfirmed ? guest.avatar_uploaded_at : null, avatar_url: avatarConfirmed ? guest.avatar_url : null } },
  }));
  await page.route('**/api/registration/guests', (route) => route.fulfill({ json: { guests: [], registrationOpen: false } }));
  await page.route('**/api/guest-avatar', async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { path: 'guest-1/avatar.jpg', signedUrl: '/api/e2e-avatar-upload' } });
    avatarConfirmed = true;
    return route.fulfill({ json: { uploadedAt: '2026-08-01T11:30:00.000Z' } });
  });
  await page.route('**/api/e2e-avatar-upload', (route) => route.fulfill({ json: { ok: true } }));
  await page.goto('/guest');
  await expect(page.getByRole('heading', { name: /拍一张开心的/ })).toBeVisible();
  await page.locator('#guest-avatar-photo').setInputFiles({
    name: 'selfie.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: '就用这张 · 进入婚礼游戏' }).click();
  await expect(page.getByText('测试宾客')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
});

test('主控首页显示健康状态且五个主要模块均可进入', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.route('**/api/admin-data', (route) => route.fulfill({ json: adminData }));
  await page.goto('/admin');

  await expect(page.getByText('婚礼日状态')).toBeVisible();
  await expect(page.getByText('系统在线')).toBeVisible();
  await expect(page.getByText(/部署 e2e-rehears/)).toBeVisible();

  const primaryNavigation = page.locator('.admin-panel-tabs');
  for (const label of ['现场流程', '审核任务', '终局结算', '婚礼设置', '开场准备']) {
    await primaryNavigation.getByRole('button', { name: label, exact: true }).click();
  }
  await page.locator('.launchpad-primary').getByRole('button', { name: /开场准备/ }).click();
  await expect(page.getByText('开场检查')).toBeVisible();
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
