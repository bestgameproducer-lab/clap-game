import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('terminal assignments close stale player-code confirmations without deleting history', async () => {
  const migration = await read('supabase/migrations/202608140008_close_mutual_confirmation_lifecycle.sql');
  assert.match(migration, /create trigger close_terminal_assignment_mutual_confirmations/);
  assert.match(migration, /new\.status in \('approved','cancelled'\)/);
  assert.match(migration, /where assignment_id=new\.id and status='PENDING'/);
  assert.match(migration, /assignment\.status in \('approved','cancelled'\)/);
  assert.doesNotMatch(migration, /delete from assignment_mutual_confirmations|truncate|drop table/);
});

test('confirmation responses are idempotent and cannot double-score a completed assignment', async () => {
  const migration = await read('supabase/migrations/202608140008_close_mutual_confirmation_lifecycle.sql');
  assert.match(migration, /if v_confirmation\.status<>'PENDING' then\s+return;/);
  assert.ok(
    migration.indexOf("if v_confirmation.status<>'PENDING'") < migration.indexOf('perform assert_wedding_not_final()'),
    'a lost-response retry must remain a no-op after final publication',
  );
  assert.match(migration, /elsif v_assignment\.status='approved' then[\s\S]+set status='ACTIVE'/);
  assert.match(migration, /v_assignment\.status in \('assigned','rejected','submitted'\)[\s\S]+perform approve_assignment/);
  assert.match(migration, /'completed_now',p_accept and v_assignment\.status in \('assigned','rejected','submitted'\)/);
});

test('guest DTO hides stale pending confirmations and ceremony pause still permits rejecting a mistake', async () => {
  const [guestData, guestPage, migration] = await Promise.all([
    read('lib/data/guest.ts'),
    read('app/guest/page.tsx'),
    read('supabase/migrations/202608140008_close_mutual_confirmation_lifecycle.sql'),
  ]);
  assert.match(guestData, /confirmation\.status !== 'PENDING'[\s\S]+\['assigned', 'rejected', 'submitted'\]\.includes/);
  assert.match(migration, /if p_accept and not phase_one_interactions_open\(v_stage\)/);
  assert.match(guestPage, /仪式期间暂不能确认完成，但误邀仍可点“ 不符合 ”拒绝|仪式期间暂不能确认完成，但误邀仍可点“不符合”拒绝/);
  assert.match(guestPage, /<button className="danger" disabled=\{busy \|\| offline\}[\s\S]*?>不符合<\/button>/);
});

test('a pending trickster invitation stays rejectable while acceptance is paused', async () => {
  const guestPage = await read('app/guest/page.tsx');
  const signal = guestPage.slice(
    guestPage.indexOf('function renderTricksterSignal'),
    guestPage.indexOf('return <main', guestPage.indexOf('function renderTricksterSignal')),
  );
  assert.match(signal, /incoming \? <div className="connection-form">/);
  assert.match(signal, /disabled=\{busy \|\| offline \|\| !canUseTricksterSignal\}[\s\S]*?>确认是同伴/);
  assert.match(signal, /className="text-button" disabled=\{busy \|\| offline\}[\s\S]*?>不是同伴/);
  assert.match(signal, /仪式期间暂不能接受，但误邀仍可拒绝/);
});
