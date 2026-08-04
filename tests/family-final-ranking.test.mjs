import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const publicData = fs.readFileSync(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const adminData = fs.readFileSync(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const hostData = fs.readFileSync(new URL('../lib/data/host.ts', import.meta.url), 'utf8');

test('family guests stay in personal finale rankings without creating a family team score', () => {
  assert.doesNotMatch(publicData, /eligible_for_personal_score', true\)\.in\('team'/);
  assert.match(publicData, /team: guest\.team/);
  assert.match(publicData, /countsForTeam: guest\.participation_mode === 'ACTIVE_PLAYER' && \['海岛组', '沙漠组'\]\.includes\(guest\.team\)/);

  assert.match(adminData, /guest\.active && guest\.eligible_for_personal_score && guest\.drawn_at/);
  assert.match(adminData, /countsForTeam: guest\.participation_mode === 'ACTIVE_PLAYER' && \['海岛组', '沙漠组'\]\.includes\(guest\.team\)/);

  assert.match(hostData, /guest\.eligible_for_personal_score && guest\.drawn_at/);
  assert.match(hostData, /countsForTeam: guest\.participation_mode === 'ACTIVE_PLAYER' && \['海岛组', '沙漠组'\]\.includes\(guest\.team\)/);
});
