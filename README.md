# Wedding Task MVP

一个适合婚礼现场使用的轻量扫码网页：宾客先输入共享婚礼邀请码，从可搜索的名单中选择姓名，再输入自己的四位密码；随后通过一次性抽卡领取组别、秘密身份和任务。主办方可以控制注册与婚礼阶段、重置误认领、审核任务、加分、开放投票和公布结果。

## 已包含

- 宾客专属四位密码与持久会话
- 一次性、均衡分组的秘密身份抽卡
- 默认隐藏身份卡，防止旁人看到屏幕
- 每位宾客只能读取自己的任务与线索
- 任务完成申请
- 主办方审核并自动加分
- 最终投票与后台统计
- 投票开关和结果公布开关
- Supabase 云数据库
- 适合部署到 Vercel

## 1. 创建 Supabase 项目

1. 创建一个免费 Supabase 项目。
2. 打开 SQL Editor。
3. 新项目先运行 `supabase/schema.sql`。
4. 按文件名顺序运行 `supabase/migrations` 中尚未应用的迁移。迁移只允许向前执行，不要重复编辑已经上线的迁移文件。
5. 如需本地示例数据，再运行 `supabase/seed-example.sql`。
5. 在 Project Settings → API 中复制：
   - Project URL
   - `service_role` key

重要：`service_role` key 只能放在部署平台的服务器环境变量中，绝不能放进浏览器代码或公开仓库。

## 2. 本地运行

```bash
cp .env.example .env.local
npm install
npm run dev
```

编辑 `.env.local`：

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SESSION_SECRET=请填写至少32位随机字符串
ADMIN_PASSWORD=请填写至少12位的管理员密码
NEXT_PUBLIC_WEDDING_TITLE=我们的婚礼秘密任务
```

浏览：

- 首页：`http://localhost:3000`
- 宾客页：`http://localhost:3000/guest`
- 后台：`http://localhost:3000/admin`

登录流程：

- 共享婚礼邀请码：`LOVE2026`
- 邀请码验证通过后才显示可搜索的宾客名单
- 可用中文、拼音或英文名搜索
- 输入本人四位密码后才能认领身份
- 四位密码只以哈希形式存储在 Supabase

每个宾客身份只能认领一次。误领时，在主办方控制台的“宾客进度”中点击“重置”。

## 3. 部署到 Vercel

1. 将项目上传到 GitHub 私有仓库。
2. 在 Vercel 中导入仓库。
3. 添加与 `.env.local` 相同的五个环境变量。
4. 点击 Deploy。
5. 用最终网址生成普通二维码。

## 4. 替换成真实宾客

最简单的方法是在 Supabase Table Editor 中编辑：

- `guests`：姓名、登录码、组别、身份
- `tasks`：任务标题、描述、分数、适用身份
- `assignments`：给某位宾客绑定某项任务
- `clues`：线索文本
- `guest_clues`：给指定宾客发放线索

建议将每位宾客不同的四位密码提前私发；印在座位卡背面是可选的现场备份方式。

## 开发验证

提交代码前运行：

```bash
npm run typecheck
npm test
npm run build
```

生产环境缺少 Supabase 配置、32 位会话密钥或 12 位管理员密码时，服务器会拒绝启动相关功能。不要在生产环境使用 `.env.example` 中的占位值。

## 当前 MVP 的边界

为了尽快、免费、稳定地上线，第一版没有加入：

- 图片上传
- 群聊
- 短信或微信登录
- 多轮任务自动解锁
- 复杂动画

这些都可以在核心流程测试稳定后再加。

## 婚礼现场建议

- 婚礼前用至少 5 台不同手机测试。
- 准备纸质任务卡作为网络故障备用方案。
- 让主持人或伴郎伴娘负责后台审核。
- 最终投票前提醒宾客刷新页面。
