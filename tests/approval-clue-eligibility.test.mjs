import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290044_approval_clue_eligibility.sql', import.meta.url);

test('public story-role guests can be approved without receiving secret clues', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const clueGuard = migration.indexOf("if v_rank<=v_clue_limit and v_eligible_for_secret_role and v_role<>'spy' then");
  const clueInsert = migration.indexOf('insert into guest_clues');

  assert.match(migration, /returning points,role,team,eligible_for_secret_role/);
  assert.ok(clueGuard > 0 && clueInsert > clueGuard);
  assert.match(migration, /update assignments set status='approved',approved_at=now\(\)/);
  assert.match(migration, /'secret_clue_eligible',v_eligible_for_secret_role/);
});

test('approval still records points and rank before the optional clue reward', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const points = migration.indexOf('insert into points_ledger');
  const approved = migration.indexOf("update assignments set status='approved'");
  const rank = migration.indexOf('update assignments set completion_rank=v_rank');
  const clueGuard = migration.indexOf('if v_rank<=v_clue_limit and v_eligible_for_secret_role');

  assert.ok(points > 0 && approved > points && rank > approved && clueGuard > rank);
  assert.match(migration, /grant execute on function approve_assignment\(uuid,text,text\) to service_role/);
});
