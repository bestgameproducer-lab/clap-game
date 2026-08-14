import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the predeploy grant cannot make old upload paths compatible with run-scoped confirmation', async () => {
  const [resetBoundary, uploadBoundary, compatibility, contract, rollout] = await Promise.all([
    read('supabase/migrations/202608130001_harden_rehearsal_reset_completeness.sql'),
    read('supabase/migrations/202608130018_lock_signed_uploads_to_rehearsal_run.sql'),
    read('supabase/migrations/202608130029_predeploy_legacy_compatibility.sql'),
    read('supabase/migrations/202608130031_postdeploy_contract_legacy_rpcs.sql'),
    read('docs/database-app-rollout.md'),
  ]);

  // Constraints retain historical rows, but new confirmation requires a run
  // component. Merely granting the old signature cannot translate an already
  // signed guest/avatar.jpg or guest/assignment/evidence.jpg upload.
  assert.match(resetBoundary, /avatar_path ~ '\^\[0-9a-f-\]\{36\}\/\(avatar\|\[0-9a-f-\]\{36\}\)\[\.\]jpg\$'/);
  assert.match(resetBoundary, /v_expected_path:=p_guest_id::text\|\|'\/'\|\|v_rehearsal_run_id::text\|\|'\.jpg'/);
  assert.match(resetBoundary, /v_expected_path:=p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\/'\|\|p_assignment_id::text\|\|'\.jpg'/);
  assert.match(uploadBoundary, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\.jpg'/);
  assert.match(uploadBoundary, /return p_guest_id::text\|\|'\/'\|\|v_run_id::text\|\|'\/'\|\|p_assignment_id::text\|\|'\.jpg'/);

  assert.match(compatibility, /grant execute on function confirm_guest_avatar\(uuid,text\) to service_role/);
  assert.match(compatibility, /grant execute on function confirm_assignment_evidence\(uuid,uuid,text\) to service_role/);
  assert.doesNotMatch(compatibility, /create (?:or replace )?function confirm_(?:guest_avatar|assignment_evidence)/);
  assert.match(contract, /revoke all on function confirm_guest_avatar\(uuid,text\) from service_role/);
  assert.match(contract, /revoke all on function confirm_assignment_evidence\(uuid,uuid,text\) from service_role/);

  assert.match(rollout, /宾客 ID\/avatar\.jpg/);
  assert.match(rollout, /宾客 ID\/任务 ID\/evidence\.jpg/);
  assert.match(rollout, /仅关闭“宾客注册”不是维护模式/);
  assert.match(rollout, /阻断所有写方法/);
  assert.match(rollout, /旧应用在这一步之前不得重新接收流量/);
  assert.match(rollout, /不得认为 `029` 已经让旧版上传兼容/);
});

test('the documented contract and allocator migrations follow filename order in one maintenance window', async () => {
  const [names, rollout, readme] = await Promise.all([
    readdir(new URL('../supabase/migrations/', import.meta.url)),
    read('docs/database-app-rollout.md'),
    read('README.md'),
  ]);
  const ordered = names.filter((name) => /^2026081300(?:31|32|33).*\.sql$/.test(name)).sort();
  assert.deepEqual(ordered, [
    '202608130031_postdeploy_contract_legacy_rpcs.sql',
    '202608130032_make_phase_two_allocator_team_safe.sql',
    '202608130033_assert_phase_two_photo_absorption.sql',
  ]);
  assert.match(rollout, /`202608130001`–`202608130030`/);
  assert.match(
    rollout,
    /只应用 `202608130001`–`202608130030`[\s\S]*部署与上述迁移同一提交的新应用[\s\S]*新应用已经部署且 smoke test 通过后[\s\S]*`202608130031`/,
  );
  assert.match(rollout, /`202608130031`：[\s\S]*POSTDEPLOY contract/);
  assert.ok(rollout.indexOf('`202608130031`') < rollout.indexOf('`202608130032`'));
  assert.ok(rollout.indexOf('`202608130032`') < rollout.indexOf('`202608130033`'));
  assert.match(rollout, /`202608130033`：[\s\S]*更晚的已审核 forward-only 迁移/);
  assert.match(rollout, /同一个持续维护窗口/);
  assert.match(readme, /docs\/database-app-rollout\.md/);
});
