import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('desktop builds use wasm only for the signed app runtime while deployment keeps native SWC', async () => {
  const [script, packageJson] = await Promise.all([
    readFile(new URL('../scripts/next-build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ]);
  assert.match(script, /process\.platform === 'darwin'/);
  assert.match(script, /process\.execPath\.includes\('\/Applications\/ChatGPT\.app\/'\)/);
  assert.match(script, /environment\.NEXT_TEST_WASM_DIR/);
  assert.match(packageJson, /"build": "node scripts\/next-build\.mjs"/);
});
