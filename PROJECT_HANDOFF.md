# Wedding Mission 项目交接入口

> 最后更新：2026-07-30。目标婚礼日期暂按 2026-08-22 理解，请接手时向项目负责人确认。

这份文件是另一台电脑接手项目时的单一入口。代码、数据库迁移、测试和现场文档都保存在 GitHub 仓库中；生产数据与配置保存在 Supabase；部署由 Vercel 从 `main` 自动完成。不要通过聊天、Git 或截图传递任何密码和密钥。

## 1. 项目地址与云资源

- GitHub：`https://github.com/bestgameproducer-lab/clap-game.git`
- 生产网站：`https://clap-game-hlj6.vercel.app`
- Vercel 团队/账号：`zmdward`
- Vercel 项目：`clap-game-hlj6`
- Supabase 项目 ID：`bkrtgrufcctgxyfxdgqy`
- Supabase Dashboard：`https://supabase.com/dashboard/project/bkrtgrufcctgxyfxdgqy`
- 技术栈：Next.js 15、React 19、TypeScript、Supabase/PostgreSQL、Vercel、Node.js 24

主要页面：

- `/guest`：宾客登录、抽卡、身份与任务、积分、投票
- `/admin`：主办方控制台
- `/host`：主持人流程台与团队/个人加分
- `/station`：现场任务核验站
- `/scoreboard`：公开投影大屏
- `/admin/cards`：可打印宾客卡片

## 2. 在另一台电脑开始工作

先在新电脑登录拥有仓库权限的 GitHub 账号，然后运行：

```powershell
git clone https://github.com/bestgameproducer-lab/clap-game.git wedding-game
cd wedding-game
git switch main
git pull --ff-only origin main
npm install
npm run typecheck
npm test
npm run build
```

确认 `supabase/migrations/202607300007_fix_reset_safe_update.sql` 存在。这代表已包含 2026-07-30 的清场修复。开始任何改动前新建 `codex/` 分支，不要直接推送 `main`。

本地运行需要创建不提交 Git 的 `.env.local`：

```env
SUPABASE_URL=https://bkrtgrufcctgxyfxdgqy.supabase.co
SUPABASE_SERVICE_ROLE_KEY=从 Supabase Project Settings/API 安全取得
ADMIN_PASSWORD=从项目负责人或 Vercel 环境变量安全取得
NEXT_PUBLIC_WEDDING_TITLE=婚礼页面标题
```

环境变量名的无密钥模板见 `.env.example`。不要要求项目负责人把管理员密码或 service-role key 粘贴进 Codex 对话；优先使用已经登录的 Supabase/Vercel 页面或本机密码管理器配置 `.env.local`。

如果只处理 GitHub 代码和线上人工测试，不一定需要把生产密钥复制到新电脑。涉及数据库变更时，先新增 forward-only 迁移，再由负责人确认后应用到生产 Supabase。

## 3. 当前生产状态

截至本文件更新时间：

- PR #24 的清场修复已合并到 `main`，合并提交为 `d7ffe86e71c442f6f9c2a1340cdbbf2f385c7162`。
- 最新已应用的生产迁移是 `202607300007_fix_reset_safe_update.sql`。
- 已实际执行并验证一次完整彩排清场。
- 宾客认领、四位密码、宾客会话、抽卡结果、任务进度、验证照片、线索领取、投票及个人/团队/间谍/资源流水均为 0。
- 私有 `task-evidence` 中的真实验证照片文件为 0，待清理照片队列为 0；Supabase 可能保留一个 0 字节 `.emptyFolderPlaceholder`，它不是宾客照片。
- 注册关闭、投票关闭、公开大屏关闭。
- 正式 32 人名单、初始角色/家人类型、任务与线索配置、主持题库、隐藏卡配置和审计记录被保留。
- 最近完整验证：207 项测试通过，`npm run typecheck` 通过，`npm run build` 通过。

清场不是延时任务。正常情况下按钮应在几秒内返回成功；出现红色错误就是真实失败，应立即查看 Vercel `/api/admin-action` 日志，不要告诉用户继续等待。

## 4. 已确认的产品规则

### 登录与账号

1. 宾客通过二维码或网址进入。
2. 先输入一个可共享的邀请码，通过后才显示可搜索的宾客姓名列表。
3. 登录名使用 `Fangzhou Chen`、`Yirui Zhang` 这类英文/拼音格式；页面显示名可同时包含中文和英文。
4. 宾客第一次认领姓名时自行设置四位数字密码，不需要主办方逐人发送密码。
5. 每个宾客身份只能被认领一次；以后可在其他设备用同一姓名和四位密码登录。
6. 忘记密码或认领错误只能由后台重置；密码和会话只保存不可逆散列。

### 抽卡、家人与秘密身份

- 每位使用 App 的宾客都有抽卡动作；卡片本身和保留按钮都可以触发抽取。
- 家人也登录并先抽“荣誉惊喜卡”，文字核心是“你已经完成了最重要的任务，陪伴新郎/新娘长大”等感谢内容。抽完后仍进入正常主界面，可参加公开活动和积分，但不领取普通秘密任务或线索。
- 新郎 Zimin Jin、新娘 Anrong 是 `PRINCIPAL`，保留专属惊喜内容，不进入普通秘密任务池。
- Yifan Yu 是誓词引导人；Andao Chen 与 Xingcheng Jin 是戒指守护者。固定剧情职务通过抽卡动画揭晓，但不进入恶作剧者池。
- 秘密身份默认隐藏。普通身份可“按住查看”，松手立即盖住；长内容另有可滚动的“展开查看/再次隐藏”。切后台、锁屏或离开页面时必须自动盖住。
- 所有人都必须看到“不要告诉别人身份、阵营或任务”的明确提示。
- 恶作剧者未主动展开时，主界面必须和普通玩家完全一样：显示一项普通伪装任务，不出现“不计入个人得分”等穿帮文字。
- 恶作剧者按住身份仍应看到真实身份；点击“展开查看”才进入真实身份和真实秘密任务，再点一次隐藏。
- 丘比特帮手玩法已于 `202607300008_remove_cupid_helper_feature.sql` 整体移除；预设恶作剧者仍必须正常抽卡，预设不能破坏容量或任务分配。

### 任务与同步

- 任务列表按最新任务在最上方排列，并默认折叠；用户展开后阅读完整内容。
- 抽卡成功后，普通任务立即出现在任务栏，不等待后台切换阶段。
- 宾客可在仪式前（`registration`、`waiting`）和仪式结束后（`task_round_2`、`group_game`）提交第一阶段任务；婚礼仪式进行中（`task_round_1`）暂停提交，进入投票或揭晓后关闭。
- 验证照片是可选证据，在允许提交的阶段应显示上传/更换/删除入口；弱网失败不能阻止现场人工核验。
- 每项任务必须显示验证方式。后台或任务站通过任务后自动加分且幂等；退回必须填写宾客可见原因。
- 自动同步应静默进行，不能每 5 秒弹绿色提示或让页面跳动。只有用户手动按“刷新状态”时显示刷新动画与成功反馈。
- 新活动提示必须完整可读并由用户手动关闭，不能短时间自动消失或只显示一半。

### 婚礼环节

代码中的七个环节及宾客默认提示在 `lib/game-stages.ts`：

1. `registration`：婚礼入场 · 宾客签到
2. `waiting`：婚礼序章 · 等待仪式
3. `task_round_1`：婚礼仪式 · 丘比特的秘密来宾
4. `task_round_2`：仪式结束 · 社交解锁
5. `group_game`：婚宴互动 · 团队挑战
6. `voting`：婚礼终章 · 最终投票
7. `results`：婚礼终章 · 身份揭晓

管理员名称、宾客看到的名称和实际婚礼阶段应一致。阶段切换必须通过数据库状态机；投票和揭晓使用专用操作，不能靠下拉框绕过结算。

### 后台与现场页面

- 管理台使用短入口/标签分区，不要把所有工具堆成一张超长页面。
- 待审核任务按最新提交在最上方，每项可折叠。
- 主持人页面当前至少开放团队加分和个人加分；所有分数操作写审计日志。
- 后台、主持台和任务站共用管理员认证并支持安全退出。
- 公开大屏在身份揭晓前绝不能泄露角色、秘密任务、线索、答案或间谍私密积分。
- 清空彩排必须由用户本人可操作，不依赖开发者到场。执行前关闭注册、投票、大屏，完成八类导出确认，填写原因并输入 `RESET WEDDING`。清空运行数据但保留名单、任务配置、锁定预设、邀请码配置、隐藏卡配置和审计。

## 5. 正式名单与角色来源

生产使用 32 人正式名单。完整、可执行的名单数据位于：

- `supabase/migrations/202607290041_final_roster_participation.sql`

关键分类：

- 新人：Anrong（新娘）、Zimin Jin（新郎）
- 固定仪式角色：Yifan Yu（誓词引导人）、Andao Chen 和 Xingcheng Jin（送戒指）
- 荣誉家人：Danying Yang、Liying Jin、Jianjun Jin、Xiaofeng Jin、Wei Jin
- Ziyang Jin 是家人但参加普通游戏
- 其余宾客为普通活跃玩家

不要根据中文关系字段自动排除家人；以 `participation_mode`、`uses_app`、`eligible_for_mission` 和明确配置为准。荣誉家人要抽惊喜卡，并在之后进入正常仪表盘参与公开活动。

## 6. 任务系统的代码真相

第一阶段真实任务、固定角色、爱心/星星配对、恶作剧者暗号和二阶段解锁逻辑主要位于：

- `supabase/migrations/202607300001_phase_one_real_missions.sql`
- `supabase/migrations/202607300003_fix_phase_one_draw_reservations.sql`
- `supabase/migrations/202607300005_fix_preset_spy_draw.sql`
- `supabase/migrations/202607300006_align_submission_windows_with_ceremony.sql`
- `supabase/migrations/202607300008_remove_cupid_helper_feature.sql`

个人任务采用小分值尺度，正常为 1–3 分；固定仪式任务可有独立分值。恶作剧者秘密计分使用独立私密账本，揭晓前不能进入个人榜或团队榜。

主持题库仍有必须在婚礼前替换的新人真实内容：`爱情档案解密 · 故事题` 不能保留虚构或占位答案。项目负责人后续还可能提供更终版的任务文案与数量，接手者应先对照迁移、测试和最新用户说明，再新增迁移调整，不能改写已上线 SQL。

## 7. 代码与数据库工作约束

完整工程规则见 `AGENTS.md`，接手时必须先读。核心要求：

- API route 保持精简；校验放 `lib/validation`，授权放 `lib/auth`，数据库操作放 `lib/data`。
- service-role key 只能用于服务器代码。
- 角色、私密任务、登录码、会话、分数、审核和答案都以服务器为准。
- 所有写操作必须认证、校验并做 same-origin 防护；管理员写操作必须审计。
- 数据库只新增按时间排序的 forward-only migration；已应用 migration 永远不修改。
- 生产现有配置与名单必须保留，除非项目负责人明确批准清场范围和恢复方案。
- UI 必须 mobile-first，重点检查 320–430px、iPhone Safari 和微信内置浏览器。
- 提交前必须运行 `npm run typecheck`、`npm test`、`npm run build`。
- 在 `codex/` 分支工作，通过 PR 合并 `main`；Vercel 从 `main` 自动部署。

## 8. 必读文件顺序

1. `AGENTS.md` — 工程和安全规则
2. 本文件 `PROJECT_HANDOFF.md` — 当前状态和已确认产品决定
3. `docs/wedding-day-runbook.md` — 婚礼当天操作与故障恢复
4. `docs/acceptance-checklist.md` — 真实手机人工验收清单
5. `lib/game-stages.ts` — 环节名称与默认提示
6. `supabase/migrations/202607290041_final_roster_participation.sql` — 32 人正式名单
7. `supabase/migrations/202607300001_phase_one_real_missions.sql` — 第一阶段真实任务机制
8. 最新迁移 `202607300002` 至 `202607300007` — 最近回归修复
9. `tests/` — 隐私、计分、抽卡、同步、清场和手机 UI 的可执行验收规则

## 9. 新电脑可直接粘贴给 Codex 的 Prompt

复制下面整个代码块作为新任务的第一条消息：

```text
你正在接手一个已经上线的婚礼沉浸式任务游戏。请作为持续负责的工程师继续开发，不要重做项目。

GitHub 仓库：https://github.com/bestgameproducer-lab/clap-game.git
生产地址：https://clap-game-hlj6.vercel.app
Supabase 项目 ID：bkrtgrufcctgxyfxdgqy
Vercel 项目：zmdward/clap-game-hlj6

请先完成以下接手动作：
1. 克隆仓库，切到并拉取最新 main；确认包含 PROJECT_HANDOFF.md 与 supabase/migrations/202607300007_fix_reset_safe_update.sql。
2. 完整阅读 AGENTS.md、PROJECT_HANDOFF.md、docs/wedding-day-runbook.md、docs/acceptance-checklist.md、lib/game-stages.ts，以及 202607290041 和 202607300001–202607300007 的迁移。
3. 运行 npm install、npm run typecheck、npm test、npm run build，报告基线结果。
4. 用只读方式核对 Git、Vercel 部署和 Supabase 当前状态；不要重置、覆盖或重新 seed 生产数据库。
5. 开发前创建 codex/ 分支。任何数据库变化都新增 forward-only migration，不修改已经上线的迁移。
6. 不要把 ADMIN_PASSWORD、SUPABASE_SERVICE_ROLE_KEY、邀请码原文、宾客四位密码或任何散列写入聊天、代码、日志或 Git。需要本地运行时，通过已登录的 Vercel/Supabase 页面或本机密码管理器配置未提交的 .env.local。

当前生产状态：2026-07-30 已完整清空彩排运行数据；注册、投票和大屏关闭；32 人名单、任务配置、初始预设与审计保留。PR #24 的安全清场修复已进入 main。最新完整基线为 207 项测试、typecheck 和 production build 全部通过。

产品核心：共享邀请码后搜索姓名；首次登录由宾客自己设置四位密码；每人只能认领一次；所有使用 App 的家人也要先抽卡，荣誉家人抽感谢惊喜卡后仍进入正常主界面参加公开活动；固定仪式角色通过抽卡揭晓；恶作剧者未展开时界面必须和普通玩家完全一致，真实身份和真实任务只在主动查看时出现；秘密内容默认隐藏；任务最新在上、默认折叠；自动同步静默；仪式前和仪式后可提交，仪式进行中暂停；公开页面绝不泄露秘密数据。

先不要自行改功能。请先用中文给我一个简洁的接手报告，包含：当前 main 提交、测试结果、生产状态、你读到的下一步优先事项、是否发现文档与代码冲突。等我给出下一项需求后再实施。
```

## 10. 交接完成标准

新电脑上的 Codex 能做到以下几点，就代表接手成功：

- 从 GitHub 获取最新 `main`，无需旧电脑本地文件。
- 能通过本文件准确说明产品规则、生产状态和安全边界。
- 基线测试、类型检查和构建通过。
- 能在已登录的云控制台中只读核对部署与数据库，但不会误清空或泄露秘密。
- 后续改动从新的 `codex/` 分支开始，并能通过 PR 进入 `main` 自动部署。
