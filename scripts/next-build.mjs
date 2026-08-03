import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nextBinary = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const environment = { ...process.env };

// The signed desktop runtime cannot load npm's native macOS SWC binary.
// Use the official wasm build only in that environment; CI and Vercel keep native SWC.
if (process.platform === 'darwin' && process.execPath.includes('/Applications/ChatGPT.app/')) {
  environment.NEXT_TEST_WASM = '1';
  environment.NEXT_TEST_WASM_DIR = join(projectRoot, 'node_modules', '@next', 'swc-wasm-nodejs');
}

const result = spawnSync(process.execPath, [nextBinary, 'build'], {
  cwd: projectRoot,
  env: environment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
