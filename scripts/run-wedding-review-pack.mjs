import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(repositoryRoot, process.env.WEDDING_REVIEW_DIR || 'artifacts/wedding-review-pack');
const zipPath = `${outputDirectory}.zip`;

await rm(outputDirectory, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(outputDirectory, { recursive: true });

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
  ['12c-lucky-star-ledger', '丘比特幸运星结算', '幸运星自动完成并在个人积分流水中显示翻倍来源。', '宾客端'],
  ['12d-family-honor-card', '家人荣誉惊喜卡', '家人领取温暖专属卡，不进入秘密任务与阵营系统。', '宾客端'],
  ['12e-team-score-clue-reward', '团队积分、线索与名次奖励', '团队阶段同时展示冻结团队分、已发线索和首轮完成奖励。', '宾客端'],
  ['13-dinner-menu', '婚宴菜单', '婚宴阶段可在游戏内查看高清菜单。', '宾客端'],
  ['14-trickster-facade', '恶作剧者伪装界面', '未展开真实界面时与普通宾客保持一致。', '宾客端'],
  ['15-trickster-truth', '恶作剧者真实界面', '主动展开后原位替换为真实身份、暗号任务和额外票权。', '宾客端'],
  ['16-final-vote', '最终投票', '玩家选择本队嫌疑人并确认不可修改的投票。', '宾客端'],
  ['16b-vote-confirmation', '投票确认状态', '选中候选人后在右侧明确确认，提交前仍可核对。', '宾客端'],
  ['16c-trickster-weighted-vote', '恶作剧者双倍投票', '真实界面同时显示已解锁能力和最终投票；提交后服务器按两票保存。', '宾客端'],
  ['17-guest-results', '宾客终局结果', '显示投票结果、恶作剧者逃脱状态和实名票源。', '宾客端'],
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
