# Wedding Mission 项目交接入口

> 最后更新：2026-08-14。目标婚礼日期为 2026-08-22。

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
- `/host`：主持人流程台、完整婚礼流程控制、团队/个人加分、终局投票结算与最终积分排名
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
```

环境变量名的无密钥模板见 `.env.example`。不要要求项目负责人把管理员密码或 service-role key 粘贴进 Codex 对话；优先使用已经登录的 Supabase/Vercel 页面或本机密码管理器配置 `.env.local`。

如果只处理 GitHub 代码和线上人工测试，不一定需要把生产密钥复制到新电脑。涉及数据库变更时，先新增 forward-only 迁移，再由负责人确认后应用到生产 Supabase。

## 3. 当前生产状态

本节只记录必须保留的生产边界，不把某个历史 PR、提交或迁移号当成实时状态。每次接手和上线前都必须分别只读核对 GitHub `main`、Vercel 生产 release SHA 与 Supabase migration history；三者不一致时停止写操作并按 `docs/database-app-rollout.md` 处理。

- `202608130001`–`202608140012` 是同一轮数据库/应用一致性升级，包含清场完整性、正式任务边界、run-scoped 写入、终局锁定、计分/线索一致性和大屏发布契约。不得把它们当成可在旧应用仍接收流量时一次性执行的普通迁移；`202608130031` 是明确的 post-deploy contract，安全顺序以 `docs/database-app-rollout.md` 为准。
- `202607310010_fix_admin_password_pgcrypto_path.sql` 修复托管 Supabase 中管理员密码校验与轮换函数的 pgcrypto 搜索路径。星星角色面向宾客显示为“星光寻觅者”；爱心与星光身份均为秘密身份，只有仪式职务公开。
- 2026-07-30 已实际执行并验证一次完整彩排清场；之后为校正正式固定卡，系统仅对尚未提交、未审核、无证据、无积分流水的旧抽卡记录做了前向对齐，没有清空或重新 seed。
- 生产正式名单现为 34 位宾客、33 个登录账号（陈天然与陈子宥共用一个家人组账号）；正式任务配置、主持题库、审计记录和已有正式运行记录必须继续保留。旧隐藏实体卡/隐藏第三名恶作剧者功能已退役；相关历史表、摘要与审计只为迁移兼容保留，不是当前现场配置。
- 注册关闭、投票关闭、公开大屏关闭。重新开放任何入口前先完成现场就绪检查。
- 主持人私密页现可查看全员分组、当前个人分与恶作剧者；管理员首页可轮换管理员密码并立即撤销全部管理员会话。
- 当前项目除 Node 回归测试外，还包含 Playwright 隔离浏览器彩排：桌面与手机尺寸会分别打开宾客、主控和主持人真实页面，但拦截为模拟数据，不接触生产 Supabase。运行 `npm run test:e2e`；Pull Request 会自动执行同一套流程。
- Service Worker 缓存版本由 Vercel Git 提交自动生成，不再人工递增固定字符串。主控首页会显示数据库连接、部署版本、同步时间、宾客进度和待处理数量，便于婚礼当天快速判断是否为旧页面或连接异常。
- 最近完整验证数字以最新 PR 检查和接手报告为准；必须运行 `npm run typecheck`、`npm test`、`npm run test:e2e` 与 `npm run build`，不要沿用本段历史测试数量。

清场不是延时任务。正常情况下按钮应在几秒内返回成功；出现红色错误就是真实失败，应立即查看 Vercel `/api/admin-action` 日志，不要告诉用户继续等待。

## 4. 已确认的产品规则

### 登录与账号

1. 宾客通过二维码或网址进入。
2. 先输入一个可共享的邀请码，通过后才显示可搜索的宾客姓名列表。
3. 登录名使用 `Fangzhou Chen`、`Yirui Zhang` 这类英文/拼音格式；页面显示名可同时包含中文和英文。
4. 名单统一按婚礼身份排列：新郎、新娘、家人组、海岛组、沙漠组、其他；同组内按中文显示名排序，其中家人组的姚刚与金晓峰交换常规姓名排序位置，停用宾客始终置后。
5. 宾客第一次认领姓名时自行设置四位数字密码，不需要主办方逐人发送密码。
6. 每个宾客身份只能被认领一次；以后可在其他设备用同一姓名和四位密码登录。
7. 忘记密码或认领错误只能由后台重置；密码和会话只保存不可逆散列。

### 抽卡、家人与秘密身份

- 每位使用 App 的宾客都有抽卡动作；卡片本身和保留按钮都可以触发抽取。
- 七位荣誉家人登录并抽“荣誉惊喜卡”，不领取普通秘密任务、隐藏身份或秘密线索。金星澄、陈安道、金紫洋从第一阶段起显示为家人组，但前两位仍领取戒指任务，金紫洋仍领取普通第一阶段任务；全部家人均排除在第二阶段任务外。
- 新郎金紫民 Zimin Jin、新娘陈安融 Anrong 是 `PRINCIPAL`，保留专属惊喜内容，不进入普通秘密任务池。
- Yifan Yu 是誓词引导人；Andao Chen 与 Xingcheng Jin 是戒指守护者。固定剧情职务通过抽卡动画揭晓，但不进入恶作剧者池。
- 秘密身份默认隐藏。普通身份可“按住查看”，松手立即盖住；长内容另有可滚动的“展开查看/再次隐藏”。切后台、锁屏或离开页面时必须自动盖住。
- 所有人都必须看到“不要告诉别人身份、阵营或任务”的明确提示。
- 恶作剧者未主动展开时，主界面必须和普通玩家完全一样：显示一项普通伪装任务，不出现“不计入个人得分”等穿帮文字。
- 恶作剧者按住身份仍应看到真实身份；点击“展开查看”才进入真实身份和真实秘密任务，再点一次隐藏。
- 丘比特帮手玩法已于 `202607300008_remove_cupid_helper_feature.sql` 整体移除；预设恶作剧者仍必须正常抽卡，预设不能破坏容量或任务分配。

### 任务与同步

- 任务列表按最新任务在最上方排列，并默认折叠；用户展开后阅读完整内容。
- 玩家编号为四位随机易读码（例如 `K7M4`），必须同时含字母和数字，并排除 `0/O/1/I/L`；不可恢复为按名单顺序递增的编号。输入会忽略空格和横杠，服务端对连续尝试限流且不通过错误信息泄露某编号是否存在。
- 抽卡成功后，普通任务立即出现在任务栏，不等待后台切换阶段。
- 宾客可在仪式前（`registration`、`waiting`）和仪式结束后（`ceremony_end`、`task_round_2`、`banquet`、`group_game`）提交第一轮任务；婚礼仪式进行中（`task_round_1`）暂停提交，进入投票或揭晓后关闭。
- 大多数任务的验证照片是可选证据；`P2-SOCIAL-003` 与 `P2-SOCIAL-004` 在宾客端提交前强制要求照片。在允许提交的阶段应显示上传/更换/删除入口；弱网时由任务站代传，或保留现场记录并在终局前补录。
- 每项任务必须显示验证方式。后台或任务站通过任务后自动加分且幂等；退回必须填写宾客可见原因。
- 自动同步应静默进行，不能每 5 秒弹绿色提示或让页面跳动。只有用户手动按“刷新状态”时显示刷新动画与成功反馈。
- 新活动提示必须完整可读并由用户手动关闭，不能短时间自动消失或只显示一半。

### 婚礼环节

代码中的九个环节及宾客默认提示在 `lib/game-stages.ts`：

1. `registration`：宾客签到 · 第一轮任务领取
2. `waiting`：等待仪式 · 第一轮任务进行中
3. `task_round_1`：婚礼仪式 · 第一轮任务暂停
4. `ceremony_end`：仪式结束 · 第一轮任务恢复
5. `task_round_2`：婚宴前奏 · 第二轮任务发放
6. `banquet`：婚宴开始 · 第二轮任务进行中
7. `group_game`：婚宴互动 · 团队挑战
8. `voting`：最终投票 · 恶作剧者指认
9. `results`：身份揭晓与颁奖 · 最终积分结算

管理员名称、宾客看到的名称和实际婚礼阶段应一致。`ceremony_end` 只恢复第一轮提交，不派发第二轮任务；进入 `task_round_2` 才会原子结束第一轮并统一派发第二轮；`banquet` 为实际婚宴开始，继续开放第二轮任务但不会重复派发。阶段切换必须通过数据库状态机；投票和揭晓使用专用操作，不能靠下拉框绕过结算。

### 后台与现场页面

- 管理台使用短入口/标签分区，不要把所有工具堆成一张超长页面。
- 待审核任务按最新提交在最上方，每项可折叠。
- 主持人页面开放私密全员总览、完整婚礼流程控制、团队加分、个人加分和终局投票结算；总览显示分组、当前分数和恶作剧者。主持人可通过二次确认切换七个常规婚礼阶段，也可发起/关闭最终投票，并在二次确认后公布身份和结算；结算完成后显示海岛组/沙漠组团队排名、包含家人的完整个人积分排名、两位恶作剧者的逃脱结果，以及按候选人归组的实名投票来源。身份揭晓前主持人只看到投票人数。所有操作均鉴权并写审计日志。
- 主持人与主控都可在终局前记录有明确原因的个人现场奖励和海岛组/沙漠组团队挑战分；个人积分不会改变团队分。任务审核、投票命中和能力奖励由系统自动结算，不得手工重复补分。团队线索结算后团队分永久冻结；身份结果首次公布后，任务审核、个人积分、线索、奖项和任务配置一并冻结。
- 正式 `P1-*`/`P2-*` 任务在后台只读，由版本化任务清单维护。自定义临时任务只允许在彩排模式创建、编辑和派发；正式婚礼模式始终锁定 23 项官方任务，现场不能用临时任务绕过清单。终局公布后，彩排模式中的自定义任务也一并冻结。
- 第一幕最后未配对的爱心与星星不能提前看到“孤单丘比特/领航星”身份；第二幕开启时才以专属命运觉醒弹窗揭示第一幕落单是伏笔，并在对应任务卡内解释能力来源、结算方式及公开/保密规则。关闭页面后再登录，只要该次觉醒尚未确认，仍需补弹。
- 管理员可在首页安全工具中更换管理员密码；新密码只保存 bcrypt 散列，更换后全部管理员会话立即失效，密码与散列不得进入日志、Git 或聊天。
- 后台、主持台和任务站共用管理员认证并支持安全退出。
- 公开大屏在身份揭晓前绝不能泄露角色、秘密任务、线索、答案或间谍私密积分。
- 清空彩排必须由用户本人可操作，不依赖开发者到场。执行前关闭注册、投票、大屏，完成八类清场前核对导出确认，填写原因并输入 `RESET WEDDING`。八类 CSV 仅供人工核对，不是包含照片、密码/会话或密封选择的完整恢复包。清空运行数据和整个线索库，但保留名单、任务配置、锁定预设、邀请码配置和审计；不会生成或保留任何可现场兑换的隐藏实体卡。私密照片未清理完成前不得重新开放注册。
- 终局公布是不可逆的本场结算边界：不能隐藏后重开、不能返回常规环节，也不能继续修改会影响结果的数据。若只是不想继续投屏，单独关闭公开大屏；不要把“关闭大屏”理解为撤销结算。

## 5. 正式名单与角色来源

生产使用 34 位宾客、33 个登录账号的正式名单。原始 32 个账号的完整基线位于：

- `supabase/migrations/202607290041_final_roster_participation.sql`

关键分类：

- 新人：陈安融 Anrong（新娘）、金紫民 Zimin Jin（新郎）
- 固定仪式角色：Yifan Yu（誓词引导人）、Andao Chen 和 Xingcheng Jin（送戒指）
- 荣誉家人：Danying Yang、Liying Jin、Jianjun Jin、Xiaofeng Jin、Wei Jin、Huimin Xu、Gang Yao
- Xingcheng Jin、Andao Chen、Ziyang Jin 也属于家人组；前两位领取戒指任务，Ziyang Jin 参加第一阶段普通任务，三人均不进入第二阶段
- 其余宾客为普通活跃玩家

不要根据中文关系字段自动排除家人；以 `participation_mode`、`uses_app`、`eligible_for_mission` 和明确配置为准。荣誉家人要抽惊喜卡，并在之后进入正常仪表盘参与公开活动。

## 6. 任务系统的代码真相

第一阶段真实任务、固定角色、爱心/星星配对、恶作剧者暗号和二阶段解锁逻辑主要位于：

- `supabase/migrations/202607300001_phase_one_real_missions.sql`
- `supabase/migrations/202607300003_fix_phase_one_draw_reservations.sql`
- `supabase/migrations/202607300005_fix_preset_spy_draw.sql`
- `supabase/migrations/202607300006_align_submission_windows_with_ceremony.sql`
- `supabase/migrations/202607300008_remove_cupid_helper_feature.sql`
- `supabase/migrations/202607300009_phase_two_team_foundation.sql`
- `supabase/migrations/202607310001_phase_two_assignments_and_powers.sql`
- `supabase/migrations/202607310002_phase_two_player_actions.sql`
- `supabase/migrations/202607310003_finalize_phase_one_assignments.sql`
- `supabase/migrations/202607310004_phase_two_photo_exclusion.sql`
- `supabase/migrations/202607310005_admin_password_rotation.sql`
- `supabase/migrations/202607310006_align_unfinished_fixed_draws.sql`
- `supabase/migrations/202607310007_phase_two_team_rank_clues.sql`
- `supabase/migrations/202607310008_fix_live_random_card_draw.sql`
- `supabase/migrations/202607310026_finalize_unmatched_symbol_players.sql`：开启第二阶段时保留已完成的爱心/星星联盟，拒绝未完成邀请，并自动为剩余左右图案补齐联盟与最终角色，避免现场漏配导致阶段切换失败。
- `supabase/migrations/202607310027_explain_star_dilemma_payoffs.sql`：在任务正文与宾客选择区完整公开“同行/独占”的 3/5/1 分博弈矩阵，不改变既有结算逻辑。
- `supabase/migrations/202607310028_phase_two_finale_clue_polish.sql`：为爱心与星光抉择补齐秘密选择规则；领航星身份可公开；丘比特幸运星在第二阶段开启时立即翻倍并完成；线索支持主办方自定义分组。
- `supabase/migrations/202607310029_limit_final_team_rewards.sql`：终局团队奖励只结算海岛组与沙漠组，避免家人组触发团队字段约束后让整次身份公布事务回滚。
- `supabase/migrations/202607310030_explain_phase_two_awakenings.sql`：前向更新孤单丘比特与领航星任务文案，明确第一幕落单是第二幕能力伏笔；保留现有任务、角色、分数与运行记录。

正式任务分值以版本化任务清单为准；固定仪式任务可有独立分值。恶作剧者没有独立积分或额外补分；其身份、伪装任务、同伴确认与最终揭晓仍保持私密边界。旧“一次性隐藏任务实体卡/隐藏第三名恶作剧者”已经退役，不能从后台、任务站或 API 新建、生成或兑换。

当前精简主持台不读取或展示旧主持题库答案；需要投屏的题目、规则和公开线索由主办方在大屏内容区现场填写。旧题库表仅作为历史配置保留，不属于开场预检或主持人操作流程。项目负责人后续还可能提供更终版的任务文案与数量，接手者应先对照迁移、测试和最新用户说明，再新增迁移调整，不能改写已上线 SQL。

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
6. `supabase/migrations/202607290041_final_roster_participation.sql` — 原始 32 个账号正式名单
7. `supabase/migrations/202608110001_add_joint_family_guest_account.sql` — 新增陈天然与陈子宥联合家人账号及共同任务
8. `supabase/migrations/202607300001_phase_one_real_missions.sql` — 第一阶段真实任务机制
9. `supabase/migrations/202607300002` 至当前最新迁移 — 正式一、二幕、清场、计分、线索、终局与安全边界；重点完整阅读 `202608130001`–`202608140012`
10. `docs/database-app-rollout.md` — `202608130031` 前后必须拆批的零写入生产上线顺序
11. `docs/rehearsal-reset-inventory.md` — 彩排清场会删除、保留和排队清理的完整数据清单
12. `lib/official-task-manifest.ts` — 正式 23 项任务的应用层白名单与任务元数据真相
13. `tests/` — 隐私、计分、抽卡、同步、清场和手机 UI 的可执行验收规则

## 9. 新电脑可直接粘贴给 Codex 的 Prompt

复制下面整个代码块作为新任务的第一条消息：

```text
你正在接手一个已经上线的婚礼沉浸式任务游戏。请作为持续负责的工程师继续开发，不要重做项目。

GitHub 仓库：https://github.com/bestgameproducer-lab/clap-game.git
生产地址：https://clap-game-hlj6.vercel.app
Supabase 项目 ID：bkrtgrufcctgxyfxdgqy
Vercel 项目：zmdward/clap-game-hlj6

请先完成以下接手动作：
1. 克隆仓库，切到并拉取最新 main；确认包含 PROJECT_HANDOFF.md、supabase/migrations/202607300007_fix_reset_safe_update.sql 与仓库当前最新迁移。
2. 完整阅读 AGENTS.md、PROJECT_HANDOFF.md、docs/wedding-day-runbook.md、docs/acceptance-checklist.md、docs/database-app-rollout.md、lib/game-stages.ts，以及 202607290041、202607300001 至当前最新的全部迁移；`202608130001`–`202608140012` 必须完整阅读。
3. 运行 npm install、npm run typecheck、npm test、npm run build，报告基线结果。
4. 用只读方式核对 Git、Vercel 部署和 Supabase 当前状态；不要重置、覆盖或重新 seed 生产数据库。
5. 开发前创建 codex/ 分支。任何数据库变化都新增 forward-only migration，不修改已经上线的迁移。
6. 不要把 ADMIN_PASSWORD、SUPABASE_SERVICE_ROLE_KEY、邀请码原文、宾客四位密码或任何散列写入聊天、代码、日志或 Git。需要本地运行时，通过已登录的 Vercel/Supabase 页面或本机密码管理器配置未提交的 .env.local。

当前生产状态：历史上已执行过彩排清场，但不能据此推断当前运行为空；注册、投票和大屏状态以主控实时显示为准；正式名单为 34 位宾客、33 个登录账号，任务配置、初始预设、当前正式运行记录与审计均须保留。请分别只读核对最新 `main`、Vercel release SHA 和 Supabase migration history；若 `202608130001`–`202608140012` 尚未完整部署，必须按数据库上线文档在单次持续维护窗口内分批执行。

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
