# 彩排清场数据边界清单

本清单用于审查 `reset_rehearsal_data`。任何新增表、Storage bucket 或运行态字段都必须先在这里和自动化测试中分类，不能默认“应该会被清掉”。

## 清场前导出边界

后台提供宾客、任务、个人积分、团队积分、线索库、线索发放、奖项和审计八类 CSV。这些文件用于清场前后人工核对，不是可一键恢复数据库的完整备份包；照片二进制、密码与会话、爱心/星星密封选择和其他私密运行快照不在导出范围内。正式婚礼数据如需灾难恢复，应依赖 Supabase 平台备份与经过验证的恢复方案，不能依赖这八类 CSV。

## 删除全部运行记录

| 分类 | 数据表 | 清场结果 |
| --- | --- | --- |
| 任务 | `assignments`、`assignment_mutual_confirmations` | 删除任务分配、状态、完成名次、早鸟分、审核、证据指针和双向确认 |
| 配对与剧情 | `symbol_pairing_assignments`、`player_relationships`、`trickster_signal_attempts`、`cupid_helper_actions` | 删除爱心/星星配对、伙伴关系、恶作剧验证和已停用旧功能残留 |
| 第二轮 | `phase_two_profiles`、`phase_two_dilemmas`、`phase_two_copy_choices` | 删除第二轮身份、能力、秘密选择、复制与结算快照 |
| 线索 | `guest_clues`、`clues` | 先删除已发线索，再删除整个现场线索库；正式线索需清场后重新创建 |
| 积分与投票 | `points_ledger`、`team_points_ledger`、`spy_points_ledger`、`votes`、`result_rewards` | 删除个人、团队、旧恶作剧积分流水、投票和终局奖励 |
| 已退休资源（内部兼容） | `team_resource_ledger` | 删除历史流水；钱包本体在原位恢复初始余额，不在产品或后台导出中出现 |
| 登录与限流 | `guest_sessions`、`guest_login_throttles`、`player_code_attempt_throttles` | 撤销宾客会话并清除本场宾客端尝试计数 |

## 原位恢复

| 数据表 | 恢复内容 | 保留内容 |
| --- | --- | --- |
| `guests` | 密码/认领/抽卡、自拍指针、积分、玩家编号、临时身份、觉醒和揭示状态归零；未锁定队伍/身份回到初始值 | 姓名、登录名、参与资格、家人/竞技组等锁定预设和工作人员备注 |
| `game_state` | 回到宾客报到；关闭注册、投票、结果和大屏；清空阶段提示、计时、结算时间、团队线索与团队分快照；轮换本场运行 ID | 邀请码散列与轮换时间、任务目录模式、奖励阈值和试探次数配置 |
| `heart_slots` | 清除已占用玩家和时间 | 五张槽位定义 |
| `hidden_task_codes` | 删除全部旧实体卡摘要、领取人、时间和任务分配引用 | 无；实体隐藏任务卡路径已完整退休，历史操作只保留在不可变审计记录中 |
| `team_resources` | 两队恢复初始余额 | 历史表定义；不属于当前产品流程 |
| `awards` | 清除获奖人/队、理由和发布状态 | 奖项名称与顺序 |

## 明确保留的正式配置与安全记录

`tasks`、`host_segments`、`admin_credential_override`、`admin_sessions`、`admin_login_throttles`、`audit_log`、`rehearsal_resets`。

管理员会话和登录限流属于后台安全边界，不随宾客彩排清场删除。旧版 `alliance_clue_fragments` 的表结构只为迁移兼容而保留，但内容与启用状态会一并清空，不得作为正式线索回流。

## 私密 Storage

- `task-evidence`：捕获并删除 bucket 内全部对象，包括上传成功但未写回任务记录的孤立文件。
- `guest-avatars`：捕获并删除 bucket 内全部对象，并在数据库事务中先清空所有自拍指针。
- 删除失败时，剩余对象名保存在受 RLS 保护的 `rehearsal_resets` 数组中，支持同一事件幂等重试。
- 任一待删数组不为空时，数据库拒绝重新开放注册和启动第二次清场。
- 自拍与任务证据路径都带 `rehearsal_run_id`；旧签名上传即使延迟完成，也不能覆盖或关联到下一轮正式数据。
- 后台读取和“继续删除剩余私密照片”都会重新扫描两个 bucket；迟到的旧批次上传会再次进入待清理状态，但路径属于当前 `rehearsal_run_id` 的新一轮照片会被明确排除，不得误删。

## 浏览器本地状态

- 宾客的新动态确认只在设备 `localStorage` 保存不可逆内容指纹，不保存任务正文、线索正文或身份；确认记录含 `rehearsal_run_id`，清场轮换运行 ID 后，新一轮一定作为全新会话处理。
- 早鸟徽章的“已收下”状态也只保存不可逆指纹，并同时绑定 `rehearsal_run_id`、宾客、任务分配与名次；上一轮确认不能压掉下一轮徽章。
- 旧版本曾写入 `sessionStorage` 的宾客、主持人、任务站和大屏 DTO 不再恢复，并在对应页面首次加载时主动删除。当前页面只在内存中保留最近一次成功响应；重新打开或刷新后必须联网重新读取。
- 设备邀请码通行证是加密、受时效限制的便利 cookie，只保存邀请码，不保存宾客身份、任务、线索或积分；邀请码轮换后旧通行证会验证失败并被删除。宾客登录 cookie 对应的服务器会话在清场时全部删除。
- Service Worker 只缓存公开页面壳、静态构建资源和菜单图片，明确排除全部 `/api/` 响应；不会持久化宾客、后台或最终结果 DTO。

## 自动化防漏

`tests/safe-rehearsal-reset.test.mjs` 会从全部迁移历史抽取公开应用表、Storage bucket、`guests` 新字段和 `game_state` 新字段。出现未分类对象时测试直接失败；清场 SQL 同时执行事务内后置条件，任何已知运行数据残留都会回滚整次数据库清场。
