import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607290029_baseline_host_game_content.sql', import.meta.url), 'utf8');
const publicData = await readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const scoreboard = await readFile(new URL('../app/scoreboard/page.tsx', import.meta.url), 'utf8');

test('knowledge round ships ten ready, deterministic question-and-answer segments', () => {
  const titles = migration.match(/'连续知识挑战 · \d\d'/g) ?? [];
  assert.equal(titles.length, 10);
  assert.match(migration, /'堪培拉 \/ Canberra'/);
  assert.match(migration, /'水星 \/ Mercury'/);
  assert.match(migration, /'Au'/);
  assert.match(migration, /1,seed\.sort_order,true,true/);
});

test('resource auction ships six operationally explicit items', () => {
  const titles = migration.match(/'资源竞拍 · [^']+'/g) ?? [];
  assert.equal(titles.length, 6);
  for (const phrase of ['排除一个确定错误的选项', '允许立即再答一次', '额外查看当前公开照片 5 秒', '讨论时间增加 15 秒', '允许修改一次最终答案', '发布一条已复核']) {
    assert.match(migration, new RegExp(phrase));
  }
});

test('baseline content is forward-safe and does not overwrite organizer edits', () => {
  assert.equal((migration.match(/where not exists\(select 1 from host_segments/g) ?? []).length, 2);
  assert.doesNotMatch(migration, /update host_segments|delete from host_segments|truncate/);
});

test('private answers remain absent from the public data and scoreboard code', () => {
  for (const source of [publicData, scoreboard]) {
    assert.equal(source.includes('correct_answer'), false);
    assert.equal(source.includes('host_notes'), false);
    assert.equal(source.includes("from('host_segments')"), false);
  }
});
