# Wedding Task MVP

一个适合婚礼现场使用的轻量扫码网页：宾客凭姓名和四位码登录，查看秘密任务、提交完成、查看线索并参与最终投票；主办方可以审核任务、加分、开放投票和公布结果。

## 已包含

- 宾客专属登录与持久会话
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
3. 先运行 `supabase/schema.sql`。
4. 再运行 `supabase/seed-example.sql` 生成测试数据。
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
ADMIN_PASSWORD=你的管理员密码
NEXT_PUBLIC_WEDDING_TITLE=我们的婚礼秘密任务
```

浏览：

- 首页：`http://localhost:3000`
- 宾客页：`http://localhost:3000/guest`
- 后台：`http://localhost:3000/admin`

测试宾客：

- 测试宾客A / 1024
- 测试宾客B / 2048
- 测试宾客C / 4096

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

建议每位宾客使用不同的四位或六位码，并将姓名与登录码提前私发或印在座位卡背面。

## 当前 MVP 的边界

为了尽快、免费、稳定地上线，第一版没有加入：

- 图片上传
- 群聊
- 短信或微信登录
- 自动随机派发
- 多轮任务自动解锁
- 复杂动画

这些都可以在核心流程测试稳定后再加。

## 婚礼现场建议

- 婚礼前用至少 5 台不同手机测试。
- 准备纸质任务卡作为网络故障备用方案。
- 让主持人或伴郎伴娘负责后台审核。
- 最终投票前提醒宾客刷新页面。
