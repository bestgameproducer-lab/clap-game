import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const allMigrationFiles = (await readdir(migrationDirectory))
  .filter((name) => /^\d{12}_.+\.sql$/.test(name))
  .sort();
const migrationFiles = allMigrationFiles
  .filter((name) => /^202608(?:13|14).*\.sql$/.test(name));

test('every migration owns a unique sortable timestamp', () => {
  const timestamps = allMigrationFiles.map((name) => name.slice(0, 12));
  assert.equal(new Set(timestamps).size, timestamps.length,
    'duplicate migration timestamps make deployment order environment-dependent');
});

test('new forward migrations contain no accidentally duplicated control lines', async () => {
  for (const name of migrationFiles) {
    const source = await readFile(new URL(name, migrationDirectory), 'utf8');
    const lines = source.split(/\r?\n/);
    for (let index = 1; index < lines.length; index += 1) {
      const current = lines[index].trim();
      const previous = lines[index - 1].trim();
      if (!current || !previous || current !== previous) continue;
      // Adjacent `end if` lines are valid when nested branches close together.
      // Repeating an opening/mutating control line is the accidental copy that
      // can leave a branch or statement malformed.
      assert.doesNotMatch(current, /^(if|elsif|else|begin|update|insert|delete)\b/i,
        `${name}:${index + 1} repeats a SQL control statement`);
    }
  }
});

test('new forward migrations keep dollar-quoted bodies and transactions balanced', async () => {
  for (const name of migrationFiles) {
    const source = await readFile(new URL(name, migrationDirectory), 'utf8');
    assert.match(source, /^\s*(?:--[^\n]*\n)*\s*begin;/i, `${name} must start a transaction`);
    assert.match(source, /commit;\s*$/i, `${name} must commit its transaction`);
    const dollarTags = [...source.matchAll(/\$[a-z_]*\$/gi)].map((match) => match[0]);
    const counts = new Map();
    for (const tag of dollarTags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    for (const [tag, count] of counts) {
      assert.equal(count % 2, 0, `${name} has an unbalanced ${tag} dollar quote`);
    }
  }
});
