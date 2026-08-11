import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [packageJson, workflow, baseConfig, reviewConfig, reviewSpec, runner, indexBuilder, mobileBuilder, gitignore] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/browser-rehearsal.yml', import.meta.url), 'utf8'),
  readFile(new URL('../playwright.config.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../playwright.review.config.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../e2e/wedding-review-pack.spec.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/run-wedding-review-pack.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-wedding-review-index.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-wedding-review-mobile.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
]);

test('完整婚礼彩排生成可下载且不接触生产数据的截图验收包', () => {
  assert.match(packageJson, /"test:e2e:review": "node scripts\/run-wedding-review-pack\.mjs"/);
  assert.match(reviewConfig, /wedding-review-pack\.spec\.mjs/);
  assert.match(reviewConfig, /review-mobile/);
  assert.match(reviewConfig, /review-desktop/);
  assert.match(baseConfig, /testIgnore: 'wedding-review-pack\.spec\.mjs'/);
  assert.match(reviewConfig, /testIgnore: \[\]/);
  assert.match(reviewConfig, /timeout: 90_000/);
  for (const screenshot of [
    '01-home-invitation', '02-invitation-gate', '03-guest-roster', '04-create-pin',
    '05-selfie-required', '05b-selfie-preview-retake', '06-card-draw-ready', '07-card-revealed',
    '07b-trickster-card-reveal', '08-round-one-task', '08b-new-activity-after-return', '08b-public-ceremony-role',
    '09-symbol-pairing', '09b-player-directory', '09c-pairing-invitation', '09d-star-match-complete',
    '09e-heart-pairing', '10-ceremony-pause', '11-awakening-notice', '11b-guiding-star-mission',
    '11c-lonely-cupid-awakening', '11d-lonely-cupid-choice', '12-secret-dilemma',
    '12b-heart-dilemma', '12c-star-mutual-result', '12d-star-personal-win',
    '12e-heart-partner-win', '12f-heart-mutual-guarded', '12g-lucky-star-ledger',
    '12d-family-honor-card', '12e-team-score-clue-reward', '12h-early-honor-badge',
    '13-dinner-menu', '14-trickster-facade', '15-trickster-truth', '16-final-vote',
    '16b-vote-confirmation', '16c-trickster-weighted-vote',
    '17-guest-results', '20-admin-opening', '21-admin-live-flow', '22-admin-finale',
    '22b-admin-published-results', '23-host-console', '23a-host-overview', '23b-host-published-results',
    '23c-host-team-score', '23d-host-personal-score', '23e-host-stage-confirmation',
    '24-station-review', '25-public-finale',
  ]) assert.match(reviewSpec, new RegExp(screenshot));
  assert.match(runner, /manifest\.json/);
  assert.match(indexBuilder, /index\.html/);
  assert.match(indexBuilder, /README\.md/);
  assert.match(indexBuilder, /left\.order - right\.order/);
  assert.match(indexBuilder, /打开手机 PDF/);
  assert.match(indexBuilder, /thumbs\//);
  assert.match(runner, /build-wedding-review-mobile\.mjs/);
  assert.match(mobileBuilder, /wedding-review-mobile\.pdf/);
  assert.match(mobileBuilder, /page\.pdf/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /wedding-review-pack-\$\{\{ github\.run_number \}\}/);
  assert.match(gitignore, /artifacts\/wedding-review-pack\//);
  assert.doesNotMatch(reviewSpec, /SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|invitationCodeHash|password_hash/);
});
