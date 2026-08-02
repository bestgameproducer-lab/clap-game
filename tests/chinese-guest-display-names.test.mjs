import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608020005_add_chinese_guest_display_names.sql', import.meta.url);

test('confirmed Chinese guest names are added without changing stable account data', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  for (const [loginName, displayName] of [
    ['Tang-Ling Yeh', '葉瑭翎 Tang-Ling Yeh'],
    ['Feifei Xie', '謝菲菲 Feifei Xie'],
    ['Anrong', '陈安融 Anrong'],
    ['Zimin Jin', '金紫民 Zimin Jin'],
    ['Yi Ren', '任易 Yi Ren'],
  ]) {
    assert.match(migration, new RegExp(`\\('${loginName}', '${displayName}'\\)`));
  }

  assert.match(migration, /where lower\(g\.login_name\) = lower\(d\.login_name\)/);
  assert.match(migration, /guest_chinese_display_name_patch_failed/);
  assert.match(migration, /'login_names_preserved', true/);
  assert.match(migration, /'runtime_preserved', true/);
  assert.doesNotMatch(migration, /delete from|truncate|drop table|set login_name|set id|set points/i);
});
