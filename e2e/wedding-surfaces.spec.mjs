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
};

const task = {
  title: '和第一次见面的朋友合影', description: '找到一位今天第一次见面的宾客，互相介绍后合影。',
  verification_method: '向任务站出示合影。', points: 2, category: 'standard', stage: 'task_round_1',
  mission_code: 'P1-PHOTO-NEW', mechanic: 'PHOTO', score_policy: 'STANDARD',
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
  await page.goto('/guest');

  await expect(page.getByText('测试宾客')).toBeVisible();
  await expect(page.getByRole('heading', { name: '我的秘密任务' })).toBeVisible();
  await expect(page.getByText('团队实时积分')).toBeVisible();
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
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
