import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608120002_retire_legacy_upgrade_task_pool.sql', import.meta.url);

test('obsolete ranked-reward task pool is disabled and live assignments are cancelled', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(migration, /t\.category='upgrade'[\s\S]+t\.stage='task_round_2'/i);
  assert.match(migration, /a\.status in \('assigned','submitted','rejected'\)/i);
  assert.match(migration, /update tasks[\s\S]+set active=false[\s\S]+category='upgrade'[\s\S]+stage='task_round_2'/i);
  assert.match(migration, /legacy_upgrade_assignments\.cancelled/i);
  assert.match(migration, /legacy_upgrade_task_pool\.retired/i);
});

test('retirement preserves completed history, scores and issued clue records', async () => {
  const migration = await readFile(migrationUrl, 'utf8');

  assert.doesNotMatch(migration, /a\.status\s*=\s*'approved'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+(assignments|points_ledger|guest_clues|clues)/i);
  assert.doesNotMatch(migration, /truncate/i);
  assert.match(migration, /approved_history_preserved',true/i);
});
