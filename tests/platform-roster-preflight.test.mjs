import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PLATFORM_ROSTER_HEADERS,
  PLATFORM_ROSTER_MAX_BYTES,
  validatePlatformRosterCsv,
} from '../lib/platform/roster-preflight.ts';

const expectedSeats = [
  { seatId: 'PRINCIPAL-01', seatType: 'principal', team: '', missionEligible: false, finaleEligible: false },
  { seatId: 'TEAM-1-01', seatType: 'competitor', team: 'Ocean', missionEligible: true, finaleEligible: true },
];

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function rosterCsv(rows, headers = PLATFORM_ROSTER_HEADERS) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

test('local roster preflight accepts a complete seat-preserving CSV', () => {
  const result = validatePlatformRosterCsv(rosterCsv([
    ['PRINCIPAL-01', 'Partner One', 'Partner One', 'principal', '', 'false', 'false', ''],
    ['TEAM-1-01', 'Guest One', 'Guest One', 'competitor', 'Ocean', 'true', 'true', 'Table 1'],
  ]), expectedSeats);

  assert.equal(result.valid, true);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].team, 'Ocean');
  assert.equal(result.errors.length, 0);
});

test('local roster preflight rejects duplicate identities and modified seat authority', () => {
  const result = validatePlatformRosterCsv(rosterCsv([
    ['PRINCIPAL-01', 'Same Guest', 'Same Login', 'principal', '', 'false', 'false', ''],
    ['TEAM-1-01', ' same guest ', 'same login', 'trickster', 'Desert', 'false', 'true', ''],
  ]), expectedSeats);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((issue) => issue.message.includes('显示姓名')));
  assert.ok(result.errors.some((issue) => issue.message.includes('登录名')));
  assert.ok(result.errors.some((issue) => issue.message.includes('类型、队伍或参与权限已被改动')));
});

test('local roster preflight rejects schema drift, missing seats, formulas, and email login names', () => {
  const badHeader = validatePlatformRosterCsv(rosterCsv([], [...PLATFORM_ROSTER_HEADERS, 'password']), expectedSeats);
  assert.equal(badHeader.valid, false);
  assert.match(badHeader.errors[0].message, /表头/);

  const unsafe = validatePlatformRosterCsv(rosterCsv([
    ['PRINCIPAL-01', '=IMPORT()', 'person@example.com', 'principal', '', 'false', 'false', ''],
  ]), expectedSeats);
  assert.equal(unsafe.valid, false);
  assert.ok(unsafe.errors.some((issue) => issue.message.includes('安全字符')));
  assert.ok(unsafe.errors.some((issue) => issue.message.includes('邮箱地址')));
  assert.ok(unsafe.errors.some((issue) => issue.message.includes('缺少席位 TEAM-1-01')));
});

test('local roster preflight fails closed for malformed or oversized CSV', () => {
  const malformed = validatePlatformRosterCsv('"seat_id","display_name"\n"missing', expectedSeats);
  assert.equal(malformed.valid, false);
  assert.match(malformed.errors[0].message, /引号没有闭合/);

  const oversized = validatePlatformRosterCsv('x'.repeat(PLATFORM_ROSTER_MAX_BYTES + 1), expectedSeats);
  assert.equal(oversized.valid, false);
  assert.match(oversized.errors[0].message, /256 KB/);
});
