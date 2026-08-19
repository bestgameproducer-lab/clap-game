import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { shuffledQuickQuestionOrder } from '../lib/quick-quiz-order.ts';

const [page, component, route, data, styles] = await Promise.all([
  readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/host/host-game-toolkit.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/host-games/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../lib/data/host-games.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
]);

test('主持游戏题库使用单独的受保护、禁止缓存接口', () => {
  assert.match(route, /await requireAdmin\(\)/);
  assert.match(route, /noStoreJson\(await getHostGameToolkitData\(\)\)/);
  assert.match(data, /import 'server-only'/);
  assert.match(page, /fetch\('\/api\/host-games', \{ cache: 'no-store' \}\)/);
  assert.match(page, /mode === 'games'/);
  assert.doesNotMatch(page, /法国的首都|谁更喜欢梅西/);
});

test('快问快答完整包含 10 类题目并明确正式题与备用题边界', () => {
  const categories = data.match(/^  category\(/gm) ?? [];
  assert.equal(categories.length, 10);
  for (const title of ['世界首都', '中国省会／首府', '国家货币', '中国省份简称', '中国城市地标', '成语补字', '数字与时间', '动物与自然', '生活科学', '食物与日常']) assert.match(data, new RegExp(title));
  assert.match(data, /\['澳大利亚的首都是哪里？', '堪培拉'\]/);
  assert.match(data, /\['人体最大的器官是什么？', '皮肤'\]/);
  assert.match(component, /答错、超时或跳过立即结束本组挑战，并且不要公布正确答案/);
  assert.match(component, /平分加赛／替换题（2 题）/);
  assert.match(component, /答错／超时 · 结束/);
});

test('快问快答每次挑战保留同一题组并生成与上次不同的题序', () => {
  const firstOrder = shuffledQuickQuestionOrder(10, [], () => 0);
  const retryOrder = shuffledQuickQuestionOrder(10, firstOrder, () => 0);
  assert.deepEqual([...firstOrder].sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8,9]);
  assert.deepEqual([...retryOrder].sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8,9]);
  assert.notDeepEqual(retryOrder, firstOrder);
  assert.match(component, /questionOrder: shuffledQuickQuestionOrder\(formalQuestions\.length, current\[quickTeam\]\.questionOrder, secureRandomIndex\)/);
  assert.match(component, /同一类别、同一组 10 道题；每次开始以及失败重来都会重新打乱题序/);
  assert.match(component, /重排题序 · 从头挑战/);
});

test('你比划我猜和随机数都有独立、适合现场使用的主持状态', () => {
  assert.equal((data.match(/^  \{ id: '[^']+', title: '[^']+', words:/gm) ?? []).length, 6);
  assert.match(component, /setCharadesSeconds\(300\)/);
  assert.match(component, /charadesUsedIndices/);
  assert.match(component, /crypto\.getRandomValues/);
  assert.match(component, /每次独立随机，数字可能重复/);
  assert.match(component, /charadesEndsAt - Date\.now\(\)/);
  assert.match(component, /等待你确认题目和答案后再启用，不展示半成品题库/);
});

test('第四个游戏等待正式题目，不向主持人暴露半成品功能', () => {
  assert.doesNotMatch(data, /谁更喜欢梅西|coupleQuiz|answer: null/);
  assert.doesNotMatch(component, /ToolkitMode = .*couple|揭晓答案|选择问题/);
  assert.match(component, /04 · 稍后开放/);
});

test('五个主持入口和游戏工具在窄屏保留可点击布局', () => {
  assert.match(styles, /host-score-tabs\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/);
  assert.match(styles, /\.host-game-picker\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.host-game-coming-soon\{/);
});
