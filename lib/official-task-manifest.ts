export const OFFICIAL_TASK_FIELDS = [
  'title',
  'description',
  'verification_method',
  'points',
  'max_assignments',
  'role_scope',
  'category',
  'stage',
  'story_role_scope',
  'mechanic',
  'score_policy',
  'assignment_mode',
  'verification_type',
  'active',
  'is_demo',
  'grants_hidden_spy',
] as const;

export type OfficialTaskField = typeof OFFICIAL_TASK_FIELDS[number];

export type OfficialTaskSpec = {
  mission_code: string;
  title: string;
  description: string;
  verification_method: string;
  points: number;
  max_assignments: number | null;
  role_scope: string;
  category: string;
  stage: 'task_round_1' | 'task_round_2';
  story_role_scope: string;
  mechanic: string;
  score_policy: string;
  assignment_mode: string;
  verification_type: string;
  active: true;
  is_demo: false;
  grants_hidden_spy: false;
};

export type OfficialTaskCandidate = {
  mission_code?: string | null;
  title?: string;
  description?: string;
  verification_method?: string;
  points?: number;
  max_assignments?: number | null;
  role_scope?: string;
  category?: string;
  stage?: string;
  story_role_scope?: string;
  mechanic?: string;
  score_policy?: string;
  assignment_mode?: string;
  verification_type?: string;
  active?: boolean;
  is_demo?: boolean;
  grants_hidden_spy?: boolean;
};

// Text is part of the server-authoritative mission contract. A task with the
// right code but an obsolete title, instruction, or verification method is not
// safe to release to guests.
const OFFICIAL_TASK_COPY = {
  'P1-CER-001': {
    title: '誓词引导人',
    description: '请在工作人员通知后到达指定位置，引导新人完成誓词。不要提前上台或公开任务。',
    verification_method: '由主持人确认流程沟通、到位及誓词引导均已完成。',
  },
  'P1-CER-002': {
    title: '戒指守护者',
    description: '请在工作人员通知后领取指定戒指盒，并在交换戒指环节按照提示送到新人身边。',
    verification_method: '由主持人确认戒指已经安全送达。',
  },
  'P1-BOUQUET-001': {
    title: '手捧花的幸运',
    description: '仪式结束后，如果你接到手捧花，或由新人亲手将手捧花送给你，即可获得 8 点个人积分。请不要争抢或打扰仪式；只有真实获得手捧花才算完成。',
    verification_method: '由主持人确认你在仪式结束后接到或获得手捧花。',
  },
  'P1-HEART-001': {
    title: '寻找爱心伙伴',
    description: '找到持有相反半边的爱心玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。',
    verification_method: '一方发起邀请、另一方接受，或由工作人员确认。',
  },
  'P1-STAR-001': {
    title: '寻找星星伙伴',
    description: '找到持有相反半边的星星玩家。一方输入对方玩家编号发出邀请，对方在自己的页面接受后完成配对。',
    verification_method: '一方发起邀请、另一方接受，或由工作人员确认。',
  },
  'P1-SOCIAL-001': {
    title: '和第一次见面的朋友合影',
    description: '找到一位今天第一次见面的宾客，互相介绍姓名及与新人的关系，然后合影。',
    verification_method: '上传合影、双方确认或工作人员确认。',
  },
  'P1-SOCIAL-002': {
    title: '拍摄一张新郎新娘同框的照片',
    description: '在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。',
    verification_method: '上传照片或向任务站工作人员出示照片。',
  },
  'P1-BONUS-001': {
    title: '丘比特幸运星',
    description: '丘比特今天格外眷顾你。你不需要完成额外任务，打开卡片后立即获得2点个人积分。',
    verification_method: '系统自动完成。',
  },
  'P1-TRICKSTER-001': {
    title: '寻找恶作剧者同伴',
    description: '先用秘密暗号确认对方身份。确认暗号后，一方输入对方玩家编号发出邀请，对方在自己的页面接受即可建立同伴关系。',
    verification_method: '一方发起秘密邀请、另一方接受；系统记录同伴关系。',
  },
  'P2-SOCIAL-001': {
    title: '来自丘比特的敬意',
    description: '请在晚宴期间找到新郎的爸爸，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。',
    verification_method: '上传照片或向工作人员展示。',
  },
  'P2-SOCIAL-002': {
    title: '来自丘比特的祝福',
    description: '请在晚宴期间找到新娘的妈妈，送上一句真诚祝福，完成碰杯并合影。任何饮品均可，不要打断正式流程。',
    verification_method: '上传照片或向工作人员展示。',
  },
  'P2-SOCIAL-003': {
    title: '新郎特别任务',
    description: '找到新郎，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新郎的重要流程。',
    verification_method: '上传符合指定主题的合影。',
  },
  'P2-SOCIAL-004': {
    title: '新娘特别任务',
    description: '找到新娘，说一句真诚或有趣的祝福，并按页面主题完成合影。不要打断新娘的重要流程。',
    verification_method: '上传符合指定主题的合影。',
  },
  'P2-CEREMONY-001': {
    title: '晚宴致辞人',
    description: '请准备一段一至三分钟、真诚且不过度私密的新人祝福，并在主持人指定时间完成致辞。',
    verification_method: '由主持人或主办方确认。',
  },
  'P2-HEART-001': {
    title: '爱与恨的秘密选择',
    description: '你和爱心伙伴必须各自秘密选择“爱”或“恨”，全程不能商量、暗示或展示页面。双方都选爱：各得 3 分；一方选爱、一方选恨：爱为 0 分、恨为 5 分；双方都选恨：各得 1 分。',
    verification_method: '双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',
  },
  'P2-STAR-001': {
    title: '星光抉择',
    description: '你和星光伙伴必须各自秘密选择“同行”或“独占”，全程不能商量、暗示或展示页面。双方都选同行：各得 3 分；一方同行、一方独占：同行为 0 分、独占为 5 分；双方都选独占：各得 1 分。',
    verification_method: '双方分别在自己的手机上秘密提交；系统自动密封并结算，严禁提前商量。',
  },
  'P2-LONELY-001': {
    title: '孤单丘比特 · 偷心行动',
    description: '第一幕没有找到爱心另一半，并不是任务失败。丘比特刻意留下了最后一颗没有配对的爱心，让你在第二幕觉醒为“孤单丘比特”。选择一名其他竞技玩家并秘密锁定目标；最终揭晓时，你会从对方转移 3 点个人积分到自己（对方 -3，你 +3）。目标一旦提交不能修改，分数不足 3 点时也会完整扣除，你的选择需要保密。',
    verification_method: '在本任务内选择一名其他竞技玩家并确认。系统在最终揭晓时自动转移 3 点个人积分。',
  },
  'P2-GUIDE-001': {
    title: '领航星 · 带领团队',
    description: '第一幕没有找到另一半星星，并不是任务失败。丘比特刻意留下了最后一颗独行的星，让你在第二幕觉醒为本队的“领航星”。你的领航星身份可以公开：请主动召集队友、帮助大家理解团队挑战，并带领团队前进；只要全场最高团队分大于 0，本队取得第一或并列第一时，你将获得 4 点个人积分。若两队都是 0 分，则没有第一名奖励。',
    verification_method: '领航星身份可以公开；系统按最终团队积分自动结算。正分并列第一同样获奖，双方均为 0 分时不发第一名奖励。',
  },
  'P2-TRICKSTER-001': {
    title: '丘比特的恶作剧者',
    description: '尽可能让自己的团队在晚宴游戏中失去优势，同时隐藏身份。不得破坏婚礼、设备或他人手机。',
    verification_method: '最终投票与团队排名自动结算。',
  },
  'P2-POWER-001': {
    title: '双重裁决',
    description: '最终投票时你仍只选择一名本队玩家，系统会自动将你的选择按两票计算。如果本队成功抓出恶作剧者且你投对，个人投票奖励也会从 2 分翻倍为 4 分；投错仍为 1 分，未抓住则为 0 分。身份揭晓前请保密。',
    verification_method: '第二阶段开启时由系统立即标记完成；最终投票自动按两票计算，并在投对且成功抓捕时发放 4 分。',
  },
  'P2-LUCKY-001': {
    title: '超级幸运星',
    description: '你从第一幕的“丘比特幸运星”升级为“超级幸运星”。第二幕开启时，系统会立即发放“第一阶段积分快照 + 2”的额外个人分，并自动完成此能力；无需再次提交。',
    verification_method: '第二阶段开启时由系统立即结算并标记完成；无需手动提交。',
  },
} as const;

function copyFor(missionCode: keyof typeof OFFICIAL_TASK_COPY) {
  return OFFICIAL_TASK_COPY[missionCode];
}

const PHASE_ONE_TASKS = [
  ['P1-CER-001', 5, 1, 'guest', 'ceremony', 'OFFICIANT', 'STANDARD', 'STANDARD', 'FIXED', 'HOST_CONFIRM'],
  ['P1-CER-002', 3, 2, 'guest', 'ceremony', 'RING_KEEPER', 'STANDARD', 'STANDARD', 'FIXED', 'HOST_CONFIRM'],
  ['P1-BOUQUET-001', 8, 2, 'guest', 'ceremony', 'NONE', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'HOST_CONFIRM'],
  ['P1-HEART-001', 2, 5, 'guest', 'standard', 'HEART_HOLDER', 'HEART_MATCH', 'STANDARD', 'CONTROLLED_RANDOM', 'MUTUAL_CONFIRM'],
  ['P1-STAR-001', 2, 5, 'guest', 'standard', 'STAR_HOLDER', 'STAR_MATCH', 'STANDARD', 'CONTROLLED_RANDOM', 'MUTUAL_CONFIRM'],
  ['P1-SOCIAL-001', 2, 3, 'all', 'standard', 'NONE', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P1-SOCIAL-002', 2, 3, 'all', 'standard', 'NONE', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P1-BONUS-001', 2, 2, 'guest', 'standard', 'NONE', 'INSTANT_BONUS', 'STANDARD', 'FIXED', 'SYSTEM_CONFIRM'],
  ['P1-TRICKSTER-001', 0, null, 'spy', 'hidden', 'NONE', 'TRICKSTER_SIGNAL', 'NO_PERSONAL', 'ROLE_FIXED', 'MUTUAL_CONFIRM'],
] as const;

const PHASE_TWO_TASKS = [
  ['P2-SOCIAL-001', 3, 1, 'guest', 'standard', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P2-SOCIAL-002', 3, 1, 'guest', 'standard', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P2-SOCIAL-003', 3, 1, 'guest', 'standard', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P2-SOCIAL-004', 3, 1, 'guest', 'standard', 'STANDARD', 'STANDARD', 'CONTROLLED_RANDOM', 'PHOTO'],
  ['P2-CEREMONY-001', 5, 1, 'guest', 'ceremony', 'STANDARD', 'STANDARD', 'FIXED', 'HOST_CONFIRM'],
  ['P2-HEART-001', 0, 4, 'guest', 'standard', 'SECRET_DILEMMA', 'NO_PERSONAL', 'RELATIONSHIP', 'SYSTEM'],
  ['P2-STAR-001', 0, 4, 'guest', 'standard', 'SECRET_DILEMMA', 'NO_PERSONAL', 'RELATIONSHIP', 'SYSTEM'],
  ['P2-LONELY-001', 0, 1, 'guest', 'standard', 'COPY_SCORE', 'NO_PERSONAL', 'RELATIONSHIP', 'SYSTEM'],
  ['P2-GUIDE-001', 0, 1, 'guest', 'standard', 'TEAM_CAPTAIN', 'NO_PERSONAL', 'RELATIONSHIP', 'SYSTEM'],
  ['P2-TRICKSTER-001', 0, 2, 'guest', 'hidden', 'TRICKSTER_MISSION', 'NO_PERSONAL', 'ROLE_FIXED', 'SYSTEM'],
  ['P2-POWER-001', 0, 2, 'guest', 'hidden', 'INSTANT_BONUS', 'NO_PERSONAL', 'CONTROLLED_RANDOM', 'SYSTEM'],
  ['P2-LUCKY-001', 0, 2, 'guest', 'hidden', 'INSTANT_BONUS', 'NO_PERSONAL', 'FIXED', 'SYSTEM'],
] as const;

export const OFFICIAL_TASK_MANIFEST: readonly OfficialTaskSpec[] = [
  ...PHASE_ONE_TASKS.map(([mission_code, points, max_assignments, role_scope, category, story_role_scope, mechanic, score_policy, assignment_mode, verification_type]) => ({
    mission_code,
    ...copyFor(mission_code),
    points,
    max_assignments,
    role_scope,
    category,
    stage: 'task_round_1' as const,
    story_role_scope,
    mechanic,
    score_policy,
    assignment_mode,
    verification_type,
    active: true as const,
    is_demo: false as const,
    grants_hidden_spy: false as const,
  })),
  ...PHASE_TWO_TASKS.map(([mission_code, points, max_assignments, role_scope, category, mechanic, score_policy, assignment_mode, verification_type]) => ({
    mission_code,
    ...copyFor(mission_code),
    points,
    max_assignments,
    role_scope,
    category,
    stage: 'task_round_2' as const,
    story_role_scope: 'NONE',
    mechanic,
    score_policy,
    assignment_mode,
    verification_type,
    active: true as const,
    is_demo: false as const,
    grants_hidden_spy: false as const,
  })),
];

const OFFICIAL_TASK_CODE_SET = new Set(OFFICIAL_TASK_MANIFEST.map((task) => task.mission_code));

export function isOfficialWeddingMissionCode(value: unknown): value is string {
  return typeof value === 'string' && OFFICIAL_TASK_CODE_SET.has(value);
}

export function isTaskAllowedInCatalogMode(
  task: { mission_code?: unknown } | Array<{ mission_code?: unknown }> | null | undefined,
  catalogMode: string | null | undefined,
) {
  if (catalogMode !== 'live') return true;
  const normalizedTask = Array.isArray(task) ? task[0] : task;
  return isOfficialWeddingMissionCode(normalizedTask?.mission_code);
}

export const PHASE_ONE_MISSION_SPECS = OFFICIAL_TASK_MANIFEST
  .filter((task) => task.stage === 'task_round_1')
  .map((task) => [task.mission_code, task.points, task.max_assignments] as const);

export type OfficialTaskCatalogAudit = {
  matchingCount: number;
  totalCount: number;
  missingCodes: string[];
  duplicateCodes: string[];
  mismatches: Array<{ missionCode: string; fields: OfficialTaskField[] }>;
  unexpectedActiveCodes: string[];
  ready: boolean;
};

export function auditOfficialTaskCatalog(tasks: readonly OfficialTaskCandidate[]): OfficialTaskCatalogAudit {
  const officialCodes = OFFICIAL_TASK_CODE_SET;
  const missingCodes: string[] = [];
  const duplicateCodes: string[] = [];
  const mismatches: OfficialTaskCatalogAudit['mismatches'] = [];
  let matchingCount = 0;

  for (const expected of OFFICIAL_TASK_MANIFEST) {
    const candidates = tasks.filter((task) => task.mission_code === expected.mission_code);
    if (candidates.length === 0) {
      missingCodes.push(expected.mission_code);
      continue;
    }
    if (candidates.length !== 1) {
      duplicateCodes.push(expected.mission_code);
      continue;
    }
    const actual = candidates[0];
    const fields = OFFICIAL_TASK_FIELDS.filter((field) => actual[field] !== expected[field]);
    if (fields.length > 0) {
      mismatches.push({ missionCode: expected.mission_code, fields });
      continue;
    }
    matchingCount += 1;
  }

  const unexpectedActiveCodes = [...new Set(tasks
    .filter((task) => task.active === true
      && typeof task.mission_code === 'string'
      && /^P[12]-/i.test(task.mission_code)
      && !officialCodes.has(task.mission_code))
    .map((task) => task.mission_code as string))].sort();

  return {
    matchingCount,
    totalCount: OFFICIAL_TASK_MANIFEST.length,
    missingCodes,
    duplicateCodes,
    mismatches,
    unexpectedActiveCodes,
    ready: matchingCount === OFFICIAL_TASK_MANIFEST.length
      && duplicateCodes.length === 0
      && unexpectedActiveCodes.length === 0,
  };
}
