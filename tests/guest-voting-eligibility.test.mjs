import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { isFinaleVotingParticipant } from '../lib/finale-voting-core.ts';

const guestData = fs.readFileSync(new URL('../lib/data/guest.ts', import.meta.url), 'utf8');
const guestPage = fs.readFileSync(new URL('../app/guest/page.tsx', import.meta.url), 'utf8');

const eligibleGuest = {
  active: true,
  uses_app: true,
  participation_mode: 'ACTIVE_PLAYER',
  phase_two_eligible: true,
  drawn_at: '2026-08-22T01:00:00Z',
  team: '海岛组',
};

test('final voting eligibility is limited to drawn competitive phase-two players', () => {
  assert.equal(isFinaleVotingParticipant(eligibleGuest), true);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, team: '沙漠组' }), true);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, team: '家人组' }), false);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, participation_mode: 'HONOR_GUEST' }), false);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, phase_two_eligible: false }), false);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, drawn_at: null }), false);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, uses_app: false }), false);
  assert.equal(isFinaleVotingParticipant({ ...eligibleGuest, active: false }), false);
});

test('guest vote candidates use the same complete server-side boundary', () => {
  assert.match(guestData, /const votingEligible = isFinaleVotingParticipant\(guest\)/);
  assert.match(guestData, /select\('id,name,team'\)\.eq\('active', true\)\.eq\('uses_app', true\)/);
  assert.match(guestData, /\.eq\('participation_mode', 'ACTIVE_PLAYER'\)\.eq\('phase_two_eligible', true\)/);
  assert.match(guestData, /\.eq\('team', guest\.team\)\.not\('drawn_at', 'is', null\)\.neq\('id', guestId\)/);
  assert.match(guestData, /if \(!isFinaleVotingParticipant\(voterResult\.data\)\)/);
  assert.match(guestData, /if \(!isFinaleVotingParticipant\(targetResult\.data\)\)/);
});

test('non-competitive guests see an explanation without vote submission controls', () => {
  assert.match(guestPage, /data\.votingEligible && data\.game\?\.voting_open && <section className="section-card guest-vote-card"/);
  assert.match(guestPage, /data\.game\?\.voting_open && !data\.votingEligible/);
  assert.match(guestPage, /本轮不参与投票/);
  assert.match(guestPage, /最终投票由海岛组和沙漠组的第二轮正式玩家完成/);
  assert.match(guestPage, /data\.results\.votedTargetName[\s\S]+data\.votingEligible \?[\s\S]+你没有提交最终投票[\s\S]+你无需参加本轮投票/);
  assert.match(guestPage, /结果已为你开放，可以直接查看恶作剧者揭晓和最终排名/);
});
