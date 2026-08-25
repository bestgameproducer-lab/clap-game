import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const appDirectory = new URL('../app/', import.meta.url);
const libDirectory = new URL('../lib/', import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) files.push(...await sourceFiles(url));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(url);
  }
  return files;
}

test('browser persistence has an explicit reset-safe allowlist', async () => {
  const files = [...await sourceFiles(appDirectory), ...await sourceFiles(libDirectory)];
  const sources = await Promise.all(files.map(async (url) => ({
    path: url.pathname,
    source: await readFile(url, 'utf8'),
  })));

  const localStorageWrites = sources.flatMap(({ path, source }) => (
    [...source.matchAll(/localStorage\.setItem\(([^,\n]+)/g)].map((match) => ({ path, key: match[1].trim() }))
  ));
  assert.deepEqual(
    [...new Set(localStorageWrites.map(({ key }) => key))].sort(),
    ['ACTIVITY_ACK_KEY', 'EFFECT_ACK_KEY', 'PLATFORM_DRAFT_STORAGE_KEY', 'REWARD_ACK_KEY'],
    'new localStorage writes must be classified before rehearsal reset can ship',
  );
  assert.ok(localStorageWrites.every(({ path, key }) => (
    key === 'PLATFORM_DRAFT_STORAGE_KEY'
      ? path.endsWith('/app/platform/create/wedding-builder.tsx')
        || path.endsWith('/app/platform/account/platform-account-gateway.tsx')
        || path.endsWith('/app/platform/content/content-intake.tsx')
      : path.endsWith('/app/guest/page.tsx')
  )));

  const platformBuilder = sources.find(({ path }) => path.endsWith('/app/platform/create/wedding-builder.tsx'))?.source ?? '';
  const platformDraft = sources.find(({ path }) => path.endsWith('/lib/platform/draft.ts'))?.source ?? '';
  assert.match(platformDraft, /PLATFORM_DRAFT_STORAGE_KEY = 'wedding-play-studio-draft-v1'/);
  assert.doesNotMatch(platformBuilder, /rehearsalRunId|guestId|assignmentId|evidencePath/);

  const sessionStorageWrites = sources.flatMap(({ path, source }) => (
    [...source.matchAll(/sessionStorage\.setItem\(/g)].map(() => path)
  ));
  assert.deepEqual(sessionStorageWrites, [], 'private DTOs must not be persisted in sessionStorage');
  assert.ok(sources.every(({ source }) => !/indexedDB\.open\(/.test(source)), 'IndexedDB needs an explicit reset policy before use');

  const guestPage = sources.find(({ path }) => path.endsWith('/app/guest/page.tsx'))?.source ?? '';
  assert.match(guestPage, /ACTIVITY_ACK_KEY = 'wedding-guest-activity-ack-v2'/);
  assert.match(guestPage, /EFFECT_ACK_KEY = 'wedding-guest-effect-ack-v1'/);
  assert.match(guestPage, /REWARD_ACK_KEY = 'wedding-guest-reward-ack-v2'/);
  assert.match(guestPage, /rehearsalRunId: nextData\.game\?\.rehearsal_run_id/);
  assert.match(guestPage, /activityFingerprint\(`\$\{data\.game\?\.rehearsal_run_id \?\? ''\}:\$\{data\.guest\.id\}/);
});

test('public offline support never persists API or private runtime responses', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.match(worker, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return/);
  assert.doesNotMatch(worker, /cache\.put\([^\n]*(?:\/api\/|response\.json)/);
  assert.match(worker, /const APP_PATHS = \['\/guest', '\/scoreboard'\]/);
  assert.doesNotMatch(worker, /['"]\/(?:admin|host|station)['"]/);
});
