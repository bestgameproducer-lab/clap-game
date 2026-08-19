import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const resetHardening = await read('supabase/migrations/202608130001_harden_rehearsal_reset_completeness.sql');

test('guest avatars use a private forward-only storage migration', async () => {
  const migration = await read('supabase/migrations/202608020009_guest_avatar_directory.sql');
  assert.match(migration, /values\('guest-avatars','guest-avatars',false,1048576/);
  assert.match(migration, /alter table guests add column if not exists avatar_path text/);
  assert.match(migration, /avatar_path ~ '\^\[0-9a-f-\]\{36\}\/avatar\[\.\]jpg\$'/);
  assert.match(migration, /where bucket_id='guest-avatars' and name=v_expected_path/);
  assert.match(migration, /'guest\.avatar_confirm'/);
  assert.match(migration, /revoke all on function confirm_guest_avatar\(uuid,text\) from public,anon,authenticated/);
  assert.match(migration, /grant execute on function confirm_guest_avatar\(uuid,text\) to service_role/);
  assert.doesNotMatch(migration, /delete from guests|truncate|drop table/);
});

test('avatar upload is authenticated, same-origin, compressed, and server-confirmed', async () => {
  const [route, data, client, page, config, uploadHardening] = await Promise.all([
    read('app/api/guest-avatar/route.ts'),
    read('lib/data/avatar.ts'),
    read('lib/client-image.ts'),
    read('app/guest/page.tsx'),
    read('next.config.mjs'),
    read('supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql'),
  ]);
  assert.equal((route.match(/const \{ guestId, rehearsalRunId \} = await requireGuestContext\(\)/g) ?? []).length, 2);
  assert.equal((route.match(/assertSameOrigin\(request\)/g) ?? []).length, 2);
  assert.match(data, /createSignedUploadUrl\(path, \{ upsert: true \}\)/);
  assert.match(data, /\.rpc\('authorize_guest_avatar_upload'/);
  assert.doesNotMatch(data, /guestAvatarPath|select\('rehearsal_run_id/);
  const authorization = uploadHardening.slice(
    uploadHardening.indexOf('create or replace function authorize_guest_avatar_upload'),
    uploadHardening.indexOf('create or replace function authorize_guest_assignment_evidence_upload'),
  );
  assert.match(authorization, /pg_advisory_xact_lock_shared\(hashtext\('wedding-rehearsal-reset-v1'\)\)/);
  assert.match(authorization, /results_published_at is not null or exists\(select 1 from result_rewards\)/);
  assert.match(authorization, /v_claimed_at is null[\s\S]*avatar_guest_not_claimed/);
  assert.match(authorization, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\.jpg'/);
  assert.match(data, /\.rpc\('confirm_guest_avatar'/);
  assert.match(data, /createSignedUrls\(paths, AVATAR_URL_TTL_SECONDS\)/);
  assert.match(client, /export async function compressProfileAvatar/);
  assert.match(client, /AVATAR_DIMENSION = 720/);
  assert.match(client, /createImageBitmap\(file, \{ imageOrientation: 'from-image' \}\)/);
  const avatarCompressor = client.slice(client.indexOf('export async function compressProfileAvatar'));
  assert.match(avatarCompressor, /const image = await loadBrowserImageElement\(file\)/);
  assert.doesNotMatch(avatarCompressor, /const image = await loadBrowserImage\(file\)/);
  assert.match(avatarCompressor, /if \(mirrorHorizontally\)[\s\S]*context\.translate\(AVATAR_DIMENSION, 0\)[\s\S]*context\.scale\(-1, 1\)/);
  assert.doesNotMatch(page, /capture="user"/);
  assert.doesNotMatch(page, /使用系统相机/);
  assert.match(page, /const avatarConfigured = Boolean\(data\?\.guest\.avatar_path && data\?\.guest\.avatar_uploaded_at\)/);
  assert.match(page, /if \(!avatarConfigured \|\| avatarEditorOpen\) return/);
  assert.match(page, /onError=\{\(\) => setAvatarImageFailed\(true\)\}/);
  assert.match(page, /failedDirectoryAvatarCodes\[player\.playerCode\]/);
  assert.match(data, /if \(error \|\| !data\) return items\.map/);
  assert.match(data, /catch \{[\s\S]*return items\.map\(\(item\) => \(\{ \.\.\.item, avatar_url: null \}\)\)/);
  assert.match(page, /aria-label="更新我的玩家头像"/);
  assert.match(page, /拍一张开心的/);
  assert.match(page, /fetch\('\/api\/guest-avatar', \{ method: 'POST' \}\)/);
  assert.match(page, /'x-upsert': 'true'/);
  assert.match(page, /setAvatarImage\(image\)[\s\S]*setAvatarPreview\(URL\.createObjectURL\(image\)\)/);
  assert.match(page, /body: avatarImage/);
  assert.match(page, /prepareAvatar\(file: File \| null, mirrorHorizontally = false\)/);
  assert.match(client, /export async function captureSelfieFrame/);
  const cameraCapture = client.slice(client.indexOf('export async function captureSelfieFrame'));
  assert.match(cameraCapture, /context\.translate\(AVATAR_DIMENSION, 0\)/);
  assert.match(cameraCapture, /context\.scale\(-1, 1\)/);
  assert.match(page, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(page, /facingMode: 'user'/);
  assert.match(page, /aria-label="实时自拍取景画面"/);
  assert.match(page, /网页自拍会保持取景时看到的方向/);
  assert.match(page, /相册照片以确认预览为准/);
  assert.match(page, /aria-label="重新拍摄婚礼自拍"/);
  assert.match(page, /async function retakeAvatar\(\)[\s\S]*await openAvatarCamera\(\)/);
  assert.match(page, /从相册选择/);
  assert.match(page, /void prepareAvatar\(file, false\)/);
  assert.match(config, /camera=\(self\)/);
  assert.match(page, /照片左右反了？点此翻转/);
  assert.match(page, /prepareAvatar\(avatarSourceFile, !avatarMirrored\)/);
  assert.match(page, /type AvatarUploadStage = 'authorizing' \| 'uploading' \| 'confirming' \| 'refreshing'/);
  assert.match(page, /setAvatarUploadStage\('uploading'\)[\s\S]*setAvatarUploadStage\('confirming'\)[\s\S]*setAvatarUploadStage\('refreshing'\)/);
  assert.match(page, /avatarBusy \? <div className="avatar-upload-status" role="status" aria-live="polite">/);
  assert.match(page, /请不要关闭或刷新页面/);
  assert.match(page, /准备上传[\s\S]*传送照片[\s\S]*保存确认/);
  assert.doesNotMatch(page, /avatarBusy \? '正在上传你的头像…'/);
});

test('avatar object names are isolated per rehearsal run so stale signed uploads cannot replace formal selfies', () => {
  assert.match(resetHardening, /add column if not exists rehearsal_run_id uuid not null default gen_random_uuid\(\)/);
  assert.match(resetHardening, /avatar_path ~ '\^\[0-9a-f-\]\{36\}\/\(avatar\|\[0-9a-f-\]\{36\}\)\[\.\]jpg\$'/);
  assert.match(resetHardening, /v_expected_path:=p_guest_id::text\|\|'\/'\|\|v_rehearsal_run_id::text\|\|'\.jpg'/);
  assert.match(resetHardening, /rehearsal_run_id=gen_random_uuid\(\)/);
  assert.match(resetHardening, /revoke all on function confirm_guest_avatar\(uuid,text\) from public,anon,authenticated/);
});

test('home destination signature is optically centered', async () => {
  const styles = await read('app/styles.css');
  assert.match(styles, /\.home-hero \.wedding-signature\{margin-left:auto;margin-right:auto\}/);
});

test('avatar directory never exposes game-private guest fields', async () => {
  const data = await read('lib/data/guest.ts');
  const directory = data.slice(data.indexOf('export async function getPlayerCodeDirectory'), data.indexOf('export async function submitGuestAssignment'));
  for (const privateField of ['team', 'role', 'story_role', 'is_hidden_spy', 'claim_code_hash', 'login_name', 'task']) {
    assert.equal(directory.includes(privateField), false, `directory must not include ${privateField}`);
  }
  assert.match(directory, /\.not\('drawn_at', 'is', null\)/);
  assert.match(directory, /\.neq\('id', guestId\)/);
});

test('the dashboard avatar remains prominent beside the guest name', async () => {
  const styles = await read('app/styles.css');
  assert.match(styles, /\.guest-avatar-button\{[^}]*width:76px;height:76px;min-width:76px/);
  assert.match(styles, /@media\(max-width:420px\)\{\.guest-hero-profile\{gap:12px\}\.guest-avatar-button\{width:70px;height:70px;min-width:70px/);
});

test('the circular selfie preview keeps its retake hint centered and readable', async () => {
  const styles = await read('app/styles.css');
  assert.match(styles, /\.avatar-retake-trigger>span\{[^}]*left:50%;right:auto;[^}]*max-width:calc\(100% - 32px\)[^}]*transform:translateX\(-50%\)[^}]*white-space:nowrap/);
});

test('slow avatar uploads replace the camera controls with an accessible progress state', async () => {
  const styles = await read('app/styles.css');
  assert.match(styles, /\.avatar-upload-status\{[^}]*min-height:300px[^}]*place-items:center/);
  assert.match(styles, /\.avatar-upload-spinner\{[^}]*animation:avatar-upload-spin/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
});

test('the admin guest manager receives private signed avatars and reports real progress', async () => {
  const [adminData, adminPage, styles] = await Promise.all([
    read('lib/data/admin.ts'),
    read('app/admin/page.tsx'),
    read('app/styles.css'),
  ]);

  assert.match(adminData, /avatar_path,avatar_uploaded_at/);
  assert.match(adminData, /signAvatarPaths/);
  assert.match(adminPage, /label: '开场与宾客'/);
  assert.match(adminPage, /const PRIMARY_ADMIN_PANELS:[\s\S]*label: '婚礼设置'/);
  assert.match(adminPage, /\{claimed\}\/\{activeGuests\.length\} 已认领/);
  assert.match(adminPage, /\{avatarCount\}[\s\S]*已上传头像/);
  assert.match(adminPage, /\{drawn\}[\s\S]*已完成抽卡/);
  assert.match(adminPage, /guest\.avatar_url \? <img className="guest-avatar"/);
  assert.match(adminPage, /guest-progress-search/);
  assert.match(adminPage, /guest-progress-filter/);
  assert.doesNotMatch(adminPage, /\{activeGuests\.length\}\/\{data\.guests\.length\}/);
  assert.match(styles, /\.guest-progress-summary/);
  assert.match(styles, /\.guest-management-toolbar/);
});

test('space-heavy admin guest controls are collapsed by default', async () => {
  const [adminPage, styles] = await Promise.all([
    read('app/admin/page.tsx'),
    read('app/styles.css'),
  ]);

  assert.match(adminPage, /<details className="section-card admin-collapsible-card registration-control-card">/);
  assert.match(adminPage, /<details className="nested-action-details"><summary>更换共享邀请码<\/summary>/);
  assert.match(adminPage, /<details className="guest-directory-details"><summary><span>查看宾客明细<\/span>/);
  assert.doesNotMatch(adminPage, /<details className="(?:section-card admin-collapsible-card registration-control-card|nested-action-details|guest-directory-details)" open/);
  assert.match(styles, /\.admin-collapsible-card\[open\]>summary:after/);
  assert.match(styles, /\.guest-directory-details\[open\]>summary:after/);
});

test('registration consistently presents four steps before and during selfie setup', async () => {
  const page = await read('app/guest/page.tsx');
  assert.match(page, /className="step-row" aria-label="注册共四步"[\s\S]*<span>4<\/span>/);
  assert.match(page, /className="step-row avatar-registration-progress" aria-label="注册共四步，当前第四步"/);
  assert.match(page, /<span className="done">1<\/span>[\s\S]*<span className="done">3<\/span>[\s\S]*<span className="active">4<\/span>/);
  assert.match(page, /设置密码 · 下一步/);
  assert.doesNotMatch(page, /设置密码 · 开始抽卡|avatar-step-row/);
});
