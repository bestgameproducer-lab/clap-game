import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');
const data = fs.readFileSync(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');

test('guest finale uses the shared public trickster reveal and named vote trace', () => {
  assert.match(data, /getPublicScoreboard\(\)/);
  assert.match(data, /tricksters: publicScoreboard\.revealedRoles/);
  assert.match(data, /voteCounts: publicScoreboard\.voteCounts/);
  assert.doesNotMatch(data, /teamMembers: Array/);
  assert.match(page, /<h2>恶作剧者揭晓<\/h2>/);
  assert.match(page, /tally\.voters\.map/);
  assert.match(page, /成功逃脱/);
  assert.match(page, /已被识破/);
  assert.doesNotMatch(page, /data\.results\.teamMembers/);
});
