import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const seedUrl = new URL('../supabase/seed-example.sql', import.meta.url);

test('optional seed matches the current self-set PIN and roster schema', async () => {
  const seed = await readFile(seedUrl, 'utf8');
  assert.match(seed, /name,login_name,team,role,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes/);
  assert.equal(seed.includes('login_code'), false);
  assert.equal(seed.includes('claim_code_hash'), false);
  assert.equal(seed.includes('insert into assignments'), false);
  for (const team of ['玫瑰组', '月桂组']) assert.ok(seed.includes(team));
});

test('optional seed creates draw-compatible tasks and modern clues idempotently', async () => {
  const seed = await readFile(seedUrl, 'utf8');
  assert.match(seed, /insert into tasks \(title,description,verification_method,points,role_scope,category,stage,active\)/);
  for (const role of ['guest', 'spy', 'helper']) assert.ok(seed.includes(`'${role}','standard','task_round_1',true`));
  assert.match(seed, /insert into clues \(title,content,level,active\)/);
  assert.match(seed, /where not exists \(select 1 from tasks/);
  assert.match(seed, /where not exists \(select 1 from clues/);
});
