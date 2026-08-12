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

  for (const panel of ['开场与宾客', '现场执行', '婚礼设置', '任务审核', '终局结算', '安全、备份与清场']) {
    assert.match(page, new RegExp(panel));
  }
  assert.match(page, /const \[activePanel, setActivePanel\] = useState<AdminPanel>\('guests'\)/);
  assert.match(page, /主办方后台功能入口/);
  assert.match(page, /现场执行功能/);
  assert.match(styles, /\.admin-panel-tabs/);
  assert.match(styles, /\.admin-section-tabs/);
});

test('the data module clearly exposes the full rehearsal cleanup boundary', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /清场后，运行数据和线索库应全部归零/);
  assert.match(page, /清除所有宾客密码与登录、宾客自拍、抽卡结果、任务进度、验证照片、投票、个人与团队积分、历史竞拍流水、已发线索与整个线索库/);
  assert.match(page, /同时清除配对、互认和第二轮临时状态/);
  assert.match(page, /清空全部彩排运行数据/);
  assert.match(page, /resetControlsClosed/);
});
