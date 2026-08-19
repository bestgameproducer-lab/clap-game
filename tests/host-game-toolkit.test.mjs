import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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

test('你比划我猜、随机数和新人问答都有独立的主持状态与防误用提示', () => {
  assert.equal((data.match(/^  \{ id: '[^']+', title: '[^']+', words:/gm) ?? []).length, 6);
  assert.match(component, /setCharadesSeconds\(300\)/);
  assert.match(component, /charadesUsedIndices/);
  assert.match(component, /crypto\.getRandomValues/);
  assert.match(component, /每次独立随机，数字可能重复/);
  assert.match(component, /尚未填写，暂不能揭晓/);
  assert.match(component, /disabled=\{!coupleQuestion\?\.answer\}/);
});

test('新人默契问答先保留 20 个待确认问题，不伪造正式答案', () => {
  for (const prompt of ['谁更喜欢梅西？', '谁先表白？', '谁更会记住纪念日？', '谁决定婚礼细节更多？']) assert.match(data, new RegExp(prompt.replace('？', '\\？')));
  assert.match(data, /answer: null/);
  assert.match(data, /id: index \+ 1/);
  assert.match(component, /等待新人逐题确认答案后再正式使用/);
});

test('五个主持入口和游戏工具在窄屏保留可点击布局', () => {
  assert.match(styles, /host-score-tabs\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/);
  assert.match(styles, /\.host-game-picker\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:560px\)\{\.host-game-picker\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
