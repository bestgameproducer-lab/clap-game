import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { requiredTeamClueCount } from '../lib/team-clue-readiness.ts';

const [guestPage, styles, adminPage, hostPage, migration, reviewSpec] = await Promise.all([
  readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/host/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/202608140012_open_scoreboard_on_result_publish.sql', import.meta.url), 'utf8'),
  readFile(new URL('../e2e/wedding-review-pack.spec.mjs', import.meta.url), 'utf8'),
]);

test('voting keeps full clue text visible and returning guests do not wait on invitation recovery', () => {
  assert.match(styles, /guest-focus-mode>\.guest-clues-card\{order:3\}/);
  assert.doesNotMatch(styles, /guest-focus-mode>\.guest-missions-card,\.guest-focus-mode>\.guest-clues-card\{display:none\}/);
  assert.match(guestPage, /className="journey-clue"[\s\S]*?clue\.content/);
  assert.match(guestPage, /checking \|\| \(!data && deviceAccessChecking\)/);
  assert.doesNotMatch(guestPage, /if \(checking \|\| deviceAccessChecking\)/);
});

test('Cupid Lucky Star notice opens the settled personal score ledger', () => {
  assert.match(guestPage, /showLuckyStarLedger = contentNotice\?\.awakeningKind === 'CUPID_LUCKY_STAR'/);
  assert.match(guestPage, /if \(showLuckyStarLedger\) setScoreLedgerOpen\(true\)/);
});

test('staff readiness uses the same positive-first clue rule as the database', () => {
  assert.equal(requiredTeamClueCount(0, 0), 1);
  assert.equal(requiredTeamClueCount(-1, -1), 1);
  assert.equal(requiredTeamClueCount(5, 5), 2);
  assert.equal(requiredTeamClueCount(3, 5), 1);
  for (const page of [adminPage, hostPage]) {
    assert.match(page, /requiredTeamClueCount/);
    assert.match(page, /check\.clues >= check\.requiredClues/);
    assert.doesNotMatch(page, /check\.clues >= 2/);
  }
});

test('final publication opens the scoreboard once and later closure remains effective', () => {
  assert.match(migration, /not coalesce\(old\.results_visible,false\)/);
  assert.match(migration, /new\.scoreboard_visible:=true/);
  assert.match(migration, /before update of results_visible/);
});

test('review fixtures match current station, host and scoreboard DTO fields', () => {
  assert.match(reviewSpec, /const couplePhotoTask = officialTask\('P1-SOCIAL-002'\)/);
  assert.match(reviewSpec, /OFFICIAL_TASK_MANIFEST/);
  assert.match(reviewSpec, /finalLocked: true/);
  assert.match(reviewSpec, /completedTasks: 12, guests: 10/);
  assert.doesNotMatch(reviewSpec, /guestCount:/);
});
