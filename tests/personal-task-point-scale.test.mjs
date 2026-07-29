import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isTaskPointValue, recommendedTaskPoints } from '../lib/task-points.ts';

const migrationUrl = new URL('../supabase/migrations/202607290039_personal_task_point_scale.sql', import.meta.url);

test('task categories use the documented one-to-three point scale', () => {
  assert.equal(recommendedTaskPoints('standard', 'guest'), 1);
  assert.equal(recommendedTaskPoints('ceremony', 'all'), 1);
  assert.equal(recommendedTaskPoints('group', 'all'), 1);
  assert.equal(recommendedTaskPoints('upgrade', 'all'), 2);
  assert.equal(recommendedTaskPoints('hidden', 'all'), 2);
  assert.equal(recommendedTaskPoints('standard', 'spy'), 2);
  assert.equal(recommendedTaskPoints('standard', 'helper'), 2);
  assert.equal(recommendedTaskPoints('hidden', 'guest', true), 3);
  assert.equal(isTaskPointValue(1), true);
  assert.equal(isTaskPointValue(3), true);
  assert.equal(isTaskPointValue(20), false);
});

test('point-scale migration preserves accounting through correction ledger entries', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  const correctionLedger = migration.indexOf("values(v_assignment.guest_id,1,'首轮任务前三名额外奖励'");
  assert.match(migration, /insert into points_ledger\(guest_id,amount,reason,actor\)[\s\S]*select a\.guest_id,v_delta,'任务积分尺度校准','migration:202607290039'/);
  assert.match(migration, /update guests g set points=g\.points\+adjustment\.total_delta/);
  assert.match(migration, /update tasks set points=v_task\.new_points/);
  assert.match(migration, /'task\.points_scale'/);
  assert.match(migration, /check \(points between 1 and 3\)/);
  assert.equal(correctionLedger, -1);
  assert.doesNotMatch(migration, /delete from|truncate/);
});

test('task point range is enforced by the route, database, admin UI, and seed', async () => {
  const [migration, route, data, page, seed] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/admin.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/seed-example.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /if p_points<1 or p_points>3 then/);
  assert.match(route, /requiredInteger\(body\.points, '任务积分', 1, 3\)/);
  assert.match(data, /任务积分必须是 1、2 或 3 分/);
  assert.match(page, /id="task-points" type="number" min=\{1\} max=\{3\}/);
  assert.match(page, /recommendedTaskPoints/);
  assert.match(seed, /',1,'guest','standard'/);
  assert.match(seed, /',2,'spy','standard'/);
  assert.match(seed, /',2,'helper','standard'/);
});
