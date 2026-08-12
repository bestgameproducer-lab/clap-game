import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202608120003_clear_clue_library_on_rehearsal_reset.sql', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const reset = migration.slice(migration.indexOf('create or replace function reset_rehearsal_data'));

test('rehearsal reset clears issued clues before clearing the complete clue library', () => {
  const issued = reset.indexOf('delete from guest_clues where true;');
  const assignments = reset.indexOf('delete from assignments where true;');
  const library = reset.indexOf('delete from clues where true;');

  assert.ok(issued >= 0 && assignments > issued && library > assignments);
  assert.match(migration, /'clue_library_entries',\(select count\(\*\) from clues\)/);
  assert.match(reset, /'clue_library_cleared',true/);
  assert.doesNotMatch(reset, /delete from (tasks|guests|host_segments|awards)/i);
});

test('admin reset copy explicitly distinguishes issued clues and the clue library', () => {
  assert.match(adminPage, /运行数据和线索库应全部归零/);
  assert.match(adminPage, /已发线索与整个线索库/);
  assert.match(adminPage, /正式婚礼线索需要在清场后重新创建/);
  assert.match(adminPage, /resetPreview\.clue_library_entries/);
});
