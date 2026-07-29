import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const assignmentReaders = [
  '../lib/data/admin.ts',
  '../lib/data/evidence.ts',
  '../lib/data/export.ts',
  '../lib/data/guest.ts',
  '../lib/data/public.ts',
  '../lib/data/station.ts',
];

test('assignment task embeds select the primary task relationship explicitly', async () => {
  for (const path of assignmentReaders) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const assignmentQueries = source.match(/from\('assignments'\)\.select\('[^']*'/g) ?? [];
    for (const query of assignmentQueries.filter((value) => value.includes('task:tasks'))) {
      assert.match(query, /task:tasks!assignments_task_id_fkey\(/, `${path} contains an ambiguous assignments-to-tasks embed`);
    }
  }
});
