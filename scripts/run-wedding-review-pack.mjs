import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_TASK_MANIFEST } from '../lib/official-task-manifest.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(repositoryRoot, process.env.WEDDING_REVIEW_DIR || 'artifacts/wedding-review-pack');
const zipPath = `${outputDirectory}.zip`;

await rm(outputDirectory, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(outputDirectory, { recursive: true });

const taskReviewSteps = OFFICIAL_TASK_MANIFEST.map((task) => [
  `30-task-${task.mission_code.toLowerCase()}`,
  `${task.mission_code} · ${task.title}`,
  `逐项核对正式任务说明、验证方式、积分与操作入口：${task.verification_method}`,
  '宾客端 · 正式任务矩阵',
]);

const roleReviewSteps = [
  ['40-role-wedding-guardian', '婚礼守护者秘密身份', '普通竞技宾客的秘密身份阅读界面。', '宾客端 · 角色矩阵'],
  ['40b-role-officiant', '誓词引导人公开身份', '公开仪式角色与对应任务同时可见。', '宾客端 · 角色矩阵'],
  ['40c-role-ring-keeper', '戒指守护者公开身份', '公开戒指角色、现场说明与任务入口。', '宾客端 · 角色矩阵'],
  ['40d-role-groom-cheerleader', '新郎应援者公开身份', '公开应援角色与指定节点说明。', '宾客端 · 角色矩阵'],
  ['40e-role-bride-cheerleader', '新娘应援者公开身份', '公开应援角色与指定节点说明。', '宾客端 · 角色矩阵'],
  ['40f-role-heart-holder', '爱心寻觅者秘密身份', '秘密身份阅读界面保留爱心碎片信息。', '宾客端 · 角色矩阵'],
  ['40g-role-star-holder', '星光寻觅者秘密身份', '秘密身份阅读界面保留星星碎片信息。', '宾客端 · 角色矩阵'],
  ['40h-role-trickster-truth', '恶作剧者真实身份', '主动展开后才显示真正身份与任务。', '宾客端 · 角色矩阵'],
  ['40i-role-family-honor-guest', '家庭荣誉宾客', '家人公开身份、参与边界与非秘密任务说明。', '宾客端 · 角色矩阵'],
];

const steps = [
  ['01-home-invitation', '婚礼邀请首页', '宾客从婚礼入口进入任务游戏。', '宾客端'],
  ['02-invitation-gate', '邀请码入口', '未验证邀请码时不显示宾客名单。', '宾客端'],
  ['03-guest-roster', '选择宾客身份', '验证邀请码后搜索并选择自己的姓名。', '宾客端'],
  ['04-create-pin', '设置四位密码', '首次认领宾客身份并设置个人密码。', '宾客端'],
  ['05-selfie-required', '婚礼自拍', '首次登录必须设置头像后才能进入抽卡。', '宾客端'],
  ['05b-selfie-preview-retake', '自拍确认与重拍', '相册照片进入圆形确认预览，并可直接重新拍摄或左右翻转。', '宾客端'],
  ['06-card-draw-ready', '等待抽卡', '宾客准备抽取唯一的秘密身份和首轮任务。', '宾客端'],
  ['07-card-revealed', '命运卡揭晓', '抽卡后完整阅读组别、身份、保密规则和任务。', '宾客端'],
  ['07b-trickster-card-reveal', '恶作剧者抽卡揭晓', '抽卡时明确伪装任务并提示进入主页后如何私下查看真实信息。', '宾客端'],
  ['08-round-one-task', '第一轮任务', '宾客主页显示当前流程、玩家编号和可展开的照片任务。', '宾客端'],
  ['08b-new-activity-after-return', '返回页面后的单次活动提醒', '审核状态改变后提醒一次，并可返回明确的任务状态。', '宾客端'],
  ['08b-public-ceremony-role', '公开仪式角色', '戒指守护者等现场角色以公开身份展示，同时保留任务与积分。', '宾客端'],
  ['09-symbol-pairing', '星星配对', '星星碎片、伙伴查询和编号确认都位于任务内部。', '宾客端'],
  ['09b-player-directory', '宾客验证列表', '通过头像、姓名和编号辨认伙伴，不暴露组别或身份。', '宾客端'],
  ['09c-pairing-invitation', '接受配对邀请', '收到伙伴邀请后可直接接受，不必重复输入对方编号。', '宾客端'],
  ['09d-star-match-complete', '星星合体完成', '双方确认后显示完整星星和联盟成立状态。', '宾客端'],
  ['09e-heart-pairing', '爱心碎片任务', '爱心持有者明确看到左右半心与伙伴查询入口。', '宾客端'],
  ['10-ceremony-pause', '仪式暂停任务', '婚礼仪式进行时明确暂停提交和配对。', '宾客端'],
  ['11-awakening-notice', '第二轮命运觉醒', '第一轮落单玩家在第二轮收到剧情化能力揭晓。', '宾客端'],
  ['11b-guiding-star-mission', '领航星任务解释', '觉醒后任务内解释第一幕伏笔和可公开的队长能力。', '宾客端'],
  ['11c-lonely-cupid-awakening', '孤单丘比特觉醒', '爱心落单玩家收到专属剧情揭晓而不是普通新任务提示。', '宾客端'],
  ['11d-lonely-cupid-choice', '孤单丘比特命运复制', '任务内解释来源并锁定一名竞技玩家的第二轮命运。', '宾客端'],
  ['12-secret-dilemma', '升级任务秘密选择', '任务背景、秘密选择说明和完整积分表同时出现。', '宾客端'],
  ['12b-heart-dilemma', '爱与恨秘密选择', '爱心联盟获得独立剧情和完整、无倾向的积分规则。', '宾客端'],
  ['12c-star-mutual-result', '星光双方同行结果', '双方秘密选择同行后的 3/3 分裁决。', '宾客端'],
  ['12d-star-personal-win', '星光独占结果', '一方独占、一方同行后的 5/0 分裁决。', '宾客端'],
  ['12e-heart-partner-win', '爱心伙伴获胜结果', '爱与恨分歧后的 0/5 分裁决。', '宾客端'],
  ['12f-heart-mutual-guarded', '爱心双方保留结果', '双方选择恨后的 1/1 分裁决。', '宾客端'],
  ['12g-lucky-star-ledger', '丘比特幸运星结算', '幸运星自动完成并在个人积分流水中显示翻倍来源。', '宾客端'],
  ['12d-family-honor-card', '家人荣誉惊喜卡', '家人领取温暖专属卡，不进入秘密任务与阵营系统。', '宾客端'],
  ['12e-team-score-clue-reward', '团队积分、线索与名次奖励', '团队阶段同时展示冻结团队分、已发线索和首轮完成奖励。', '宾客端'],
  ['12h-early-honor-badge', '收纳后的早鸟荣誉', '宾客收下完整奖励卡后，页面仅保留可再次打开的小徽章。', '宾客端'],
  ['13-dinner-menu', '婚宴菜单', '婚宴阶段可在游戏内查看高清菜单。', '宾客端'],
  ['14-trickster-facade', '恶作剧者伪装界面', '未展开真实界面时与普通宾客保持一致。', '宾客端'],
  ['15-trickster-truth', '恶作剧者真实界面', '主动展开后原位替换为真实身份、暗号任务和额外票权。', '宾客端'],
  ['16-final-vote', '最终投票', '玩家选择本队嫌疑人并确认不可修改的投票。', '宾客端'],
  ['16b-vote-confirmation', '投票确认状态', '选中候选人后在右侧明确确认，提交前仍可核对。', '宾客端'],
  ['16c-trickster-weighted-vote', '恶作剧者双倍投票', '真实界面同时显示已解锁能力和最终投票；提交后服务器按两票保存。', '宾客端'],
  ['17-guest-results', '宾客终局结果', '显示投票结果、恶作剧者逃脱状态和实名票源。', '宾客端'],
  ...taskReviewSteps,
  ['31-task-status-hierarchy', '进行中、待审、驳回与已完成层级', '进行中任务优先展开，待审状态清楚，驳回入口可恢复，已完成记录默认收起。', '宾客端 · 状态矩阵'],
  ['32-dinner-speech-submitted', '晚宴致辞提交后状态', '晚宴致辞人提交完成说明后明确显示等待主持人审核。', '宾客端 · 状态矩阵'],
  ...roleReviewSteps,
  ['20-admin-opening', '主控开场与宾客', '主控查看系统状态、预检和真实注册进度。', '主控端'],
  ['21-admin-live-flow', '主控现场流程', '现场执行聚焦流程控制和任务审核。', '主控端'],
  ['22-admin-finale', '主控终局结算', '按团队结算、投票和身份揭晓顺序操作。', '主控端'],
  ['22b-admin-published-results', '主控已公布终局', '公布后查看恶作剧者、实名票源和完整个人排名。', '主控端'],
  ['23-host-console', '主持人流程台', '主持人查看流程、分组和现场计分入口。', '主持人端'],
  ['23a-host-overview', '主持人全员总览', '主持人核对宾客分组、抽卡状态、个人积分与恶作剧者身份。', '主持人端'],
  ['23b-host-published-results', '主持人终局排名', '主持人端展示恶作剧者追捕结果、团队榜和完整个人排名。', '主持人端'],
  ['23c-host-team-score', '主持人团队加分', '主持人选择队伍、分数和原因后记录团队挑战成绩。', '主持人端'],
  ['23d-host-personal-score', '主持人个人加分', '主持人搜索并核对宾客后记录现场个人奖励。', '主持人端'],
  ['23e-host-stage-confirmation', '主持人流程切换确认', '主持人选择婚礼环节后再次核对影响并确认切换。', '主持人端'],
  ['23f-host-ceremony-confirmation', '主持人仪式任务确认', '区分宾客已提交、等待现场完成与已计分，并提供戒指归属选择。', '主持人端'],
  ['24-station-review', '任务站审核', '任务站优先显示待核验宾客与任务证据。', '任务站'],
  ['25-public-finale', '公开最终战报', '公开团队结果、恶作剧者和完整个人排名。', '公开战报'],
];

await writeFile(resolve(outputDirectory, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local',
  steps: steps.map(([file, title, description, surface]) => ({ file, title, description, surface })),
}, null, 2));

const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const testResult = spawnSync(runner, ['playwright', 'test', '--config=playwright.review.config.mjs'], {
  cwd: repositoryRoot,
  env: { ...process.env, WEDDING_REVIEW_DIR: outputDirectory },
  stdio: 'inherit',
});
if (testResult.status !== 0) process.exit(testResult.status ?? 1);

const mobileResult = spawnSync(process.execPath, ['scripts/build-wedding-review-mobile.mjs', outputDirectory], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
if (mobileResult.status !== 0) process.exit(mobileResult.status ?? 1);

const indexResult = spawnSync(process.execPath, ['scripts/build-wedding-review-index.mjs', outputDirectory], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
if (indexResult.status !== 0) process.exit(indexResult.status ?? 1);

if (process.platform !== 'win32') {
  spawnSync('zip', ['-qr', zipPath, outputDirectory.split('/').pop()], {
    cwd: dirname(outputDirectory),
    stdio: 'ignore',
  });
}

console.log(`Review pack: ${outputDirectory}`);
