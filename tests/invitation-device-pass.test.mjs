import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('邀请码只被加密到 HttpOnly 设备凭证', async () => {
  const [devicePass, guestsRoute] = await Promise.all([
    read('lib/invitation-device-pass.ts'),
    read('app/api/registration/guests/route.ts'),
  ]);

  assert.match(devicePass, /createCipheriv\('aes-256-gcm'/);
  assert.match(devicePass, /createDecipheriv\('aes-256-gcm'/);
  assert.match(devicePass, /randomBytes\(12\)/);
  assert.match(devicePass, /setAuthTag\(tag\)/);
  assert.match(devicePass, /INVITATION_DEVICE_MAX_AGE = 60 \* 60 \* 24 \* 180/);
  assert.match(devicePass, /age > INVITATION_DEVICE_MAX_AGE \* 1000/);
  assert.match(guestsRoute, /export async function GET\(\)/);
  assert.match(guestsRoute, /httpOnly: true/);
  assert.match(guestsRoute, /sameSite: 'lax'/);
  assert.match(guestsRoute, /createInvitationDevicePass\(invitationCode\)/);
});

test('重复登录使用设备凭证且退出个人身份时保留', async () => {
  const [claimRoute, logoutRoute, guestPage] = await Promise.all([
    read('app/api/registration/claim/route.ts'),
    read('app/api/guest-logout/route.ts'),
    read('app/guest/page.tsx'),
  ]);

  assert.match(claimRoute, /readInvitationDevicePass\(\(await cookies\(\)\)\.get\(INVITATION_DEVICE_COOKIE\)\?\.value\)/);
  assert.doesNotMatch(claimRoute, /body\.invitationCode/);
  assert.doesNotMatch(logoutRoute, /invitation_device_pass|INVITATION_DEVICE_COOKIE/);
  assert.match(guestPage, /fetch\('\/api\/registration\/guests', \{ cache: 'no-store' \}\)/);
  assert.match(guestPage, /body: JSON\.stringify\(\{ loginName: selectedGuest\.loginName, claimCode \}\)/);
  assert.doesNotMatch(guestPage, /localStorage[\s\S]*(invitation|invite)/i);
});

test('邀请码更换后旧设备凭证会失效', async () => {
  const [guestsRoute, claimRoute] = await Promise.all([
    read('app/api/registration/guests/route.ts'),
    read('app/api/registration/claim/route.ts'),
  ]);

  assert.match(guestsRoute, /listRegistrationGuests\(invitationCode\)/);
  assert.match(guestsRoute, /error instanceof ApiError && error\.status === 401[\s\S]*maxAge: 0/);
  assert.match(claimRoute, /error\.status === 401 && error\.message\.includes\('邀请码'\)[\s\S]*maxAge: 0/);
});
