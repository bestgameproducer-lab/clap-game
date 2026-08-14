import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildPublicScoreboard, hasJoinedPersonalRanking } from '../lib/scoreboard-core.ts';

const publicData = fs.readFileSync(new URL('../lib/data/public.ts', import.meta.url), 'utf8');
const adminData = fs.readFileSync(new URL('../lib/data/admin.ts', import.meta.url), 'utf8');
const hostData = fs.readFileSync(new URL('../lib/data/host.ts', import.meta.url), 'utf8');
const adminPage = fs.readFileSync(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');
const hostPage = fs.readFileSync(new URL('../app/host/page.tsx', import.meta.url), 'utf8');
const guestPage = fs.readFileSync(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

test('personal ranking boundary admits drawn players and family who revealed a card or earned points', () => {
  const cases = [
    [{ participation_mode: 'ACTIVE_PLAYER', points: 0, drawn_at: '2026-08-22T01:00:00Z', special_card_revealed_at: null }, true],
    [{ participation_mode: 'ACTIVE_PLAYER', points: 9, drawn_at: null, special_card_revealed_at: null }, false],
    [{ participation_mode: 'HONOR_GUEST', points: 0, drawn_at: null, special_card_revealed_at: '2026-08-22T01:00:00Z' }, true],
    [{ participation_mode: 'HONOR_GUEST', points: 6, drawn_at: null, special_card_revealed_at: null }, true],
    [{ participation_mode: 'HONOR_GUEST', points: 0, drawn_at: null, special_card_revealed_at: null }, false],
    [{ participation_mode: 'PRINCIPAL', points: 20, drawn_at: '2026-08-22T01:00:00Z', special_card_revealed_at: '2026-08-22T01:00:00Z' }, false],
  ];

  for (const [guest, expected] of cases) assert.equal(hasJoinedPersonalRanking(guest), expected);
});

test('a participating family guest ranks personally without creating a family team score', () => {
  const candidates = [
    { id: 'family', name: 'Family', team: '家人组', points: 8, participation_mode: 'HONOR_GUEST', drawn_at: null, special_card_revealed_at: '2026-08-22T01:00:00Z' },
    { id: 'scored-family', name: 'Scored Family', team: '家人组', points: 5, participation_mode: 'HONOR_GUEST', drawn_at: null, special_card_revealed_at: null },
    { id: 'unrevealed-family', name: 'Waiting', team: '家人组', points: 0, participation_mode: 'HONOR_GUEST', drawn_at: null, special_card_revealed_at: null },
    { id: 'player', name: 'Player', team: '海岛组', points: 2, participation_mode: 'ACTIVE_PLAYER', drawn_at: '2026-08-22T01:00:00Z', special_card_revealed_at: null },
  ];
  const rankingGuests = candidates.filter(hasJoinedPersonalRanking).map((guest) => ({
    ...guest,
    countsForTeam: guest.participation_mode === 'ACTIVE_PLAYER' && ['海岛组', '沙漠组'].includes(guest.team),
  }));
  const result = buildPublicScoreboard(rankingGuests, [], []);

  assert.deepEqual(result.leaders.map((guest) => guest.name), ['Family', 'Scored Family', 'Player']);
  assert.equal(result.leaders.some((guest) => guest.name === 'Waiting'), false);
  assert.equal(result.teams.some((team) => team.team === '家人组'), false);
  assert.equal(result.teams.find((team) => team.team === '海岛组')?.guests, 1);
});

test('public, admin, and host rankings all use the same participation boundary', () => {
  assert.match(publicData, /select\('id,name,team,points,participation_mode,drawn_at,special_card_revealed_at'\)/);
  const personalGuestQuery = publicData.match(/db\.from\('guests'\)\.select\('id,name,team,points,participation_mode,drawn_at,special_card_revealed_at'\)[^\n]+/)?.[0] ?? '';
  assert.doesNotMatch(personalGuestQuery, /not\('drawn_at', 'is', null\)/);
  assert.match(publicData, /filter\(hasJoinedPersonalRanking\)/);
  assert.match(adminData, /guest\.active && guest\.eligible_for_personal_score && hasJoinedPersonalRanking\(guest\)/);
  assert.match(hostData, /guest\.eligible_for_personal_score && hasJoinedPersonalRanking\(guest\)/);
  assert.match(adminPage, /type Guest = \{[^\n]*points: number;[^\n]*special_card_revealed_at: string \| null;/);
  assert.match(hostPage, /type Guest = \{[\s\S]*?points: number;[\s\S]*?special_card_revealed_at: string \| null;/);

  for (const source of [publicData, adminData, hostData]) {
    const rankingQuery = source.match(/db\.from\('guests'\)\.select\('[^']*participation_mode[^']*'\)[^\n]+/)?.[0] ?? '';
    assert.match(rankingQuery, /points/);
    assert.match(rankingQuery, /drawn_at/);
    assert.match(rankingQuery, /special_card_revealed_at/);
  }

  for (const source of [publicData, adminData, hostData]) {
    assert.match(source, /countsForTeam: guest\.participation_mode === 'ACTIVE_PLAYER' && \['海岛组', '沙漠组'\]\.includes\(guest\.team\)/);
  }
});

test('family guests can reach the final personal ranking without a family team score', () => {
  assert.match(guestPage, /isHonorGuest && data\.game\?\.results_visible/);
  assert.match(guestPage, /你的现场互动个人积分已进入最终榜单；家人组不计算团队名次/);
  assert.match(guestPage, /href="\/scoreboard">查看全员最终积分排名/);
});
