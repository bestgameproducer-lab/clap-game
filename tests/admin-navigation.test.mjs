import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/admin/page.tsx', import.meta.url);
const stylesUrl = new URL('../app/styles.css', import.meta.url);

test('admin console opens focused modules instead of one continuous page', async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(stylesUrl, 'utf8'),
  ]);

  for (const panel of ['开场准备', '现场流程', '宾客管理', '婚礼设置', '审核任务', '终局结算', '数据与清场']) {
    assert.match(page, new RegExp(panel));
  }
  assert.match(page, /const \[activePanel, setActivePanel\] = useState<AdminPanel>\('home'\)/);
  assert.match(page, /主办方后台功能入口/);
  assert.match(styles, /\.admin-panel-tabs/);
  assert.match(styles, /\.launchpad-grid/);
});

test('the data module clearly exposes the full rehearsal cleanup boundary', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /清场后，运行数据应全部归零/);
  assert.match(page, /清除所有宾客密码与登录、抽卡结果、任务进度、验证照片、投票、个人与团队积分、历史竞拍流水与发布状态/);
  assert.match(page, /同时清除配对、互认和第二轮临时状态/);
  assert.match(page, /清空全部彩排运行数据/);
  assert.match(page, /resetControlsClosed/);
});
