import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [packageJson, workflow, baseConfig, reviewConfig, reviewSpec, runner, indexBuilder, gitignore] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../.github/workflows/browser-rehearsal.yml', import.meta.url), 'utf8'),
  readFile(new URL('../playwright.config.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../playwright.review.config.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../e2e/wedding-review-pack.spec.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/run-wedding-review-pack.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build-wedding-review-index.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
]);

test('完整婚礼彩排生成可下载且不接触生产数据的截图验收包', () => {
  assert.match(packageJson, /"test:e2e:review": "node scripts\/run-wedding-review-pack\.mjs"/);
  assert.match(reviewConfig, /wedding-review-pack\.spec\.mjs/);
  assert.match(reviewConfig, /review-mobile/);
  assert.match(reviewConfig, /review-desktop/);
  assert.match(baseConfig, /testIgnore: 'wedding-review-pack\.spec\.mjs'/);
  assert.match(reviewConfig, /testIgnore: \[\]/);
  for (const screenshot of [
    '01-home-invitation', '02-invitation-gate', '03-guest-roster', '04-create-pin',
    '05-selfie-required', '06-card-draw-ready', '07-card-revealed', '08-round-one-task',
    '09-symbol-pairing', '10-ceremony-pause', '11-awakening-notice', '12-secret-dilemma',
    '13-dinner-menu', '14-trickster-facade', '15-trickster-truth', '16-final-vote',
    '17-guest-results', '20-admin-opening', '21-admin-live-flow', '22-admin-finale',
    '23-host-console', '24-station-review', '25-public-finale',
  ]) assert.match(reviewSpec, new RegExp(screenshot));
  assert.match(runner, /manifest\.json/);
  assert.match(indexBuilder, /index\.html/);
  assert.match(indexBuilder, /README\.md/);
  assert.match(indexBuilder, /left\.order - right\.order/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /wedding-review-pack-\$\{\{ github\.run_number \}\}/);
  assert.match(gitignore, /artifacts\/wedding-review-pack\//);
  assert.doesNotMatch(reviewSpec, /SUPABASE_SERVICE_ROLE_KEY|ADMIN_PASSWORD|invitationCodeHash|password_hash/);
});
