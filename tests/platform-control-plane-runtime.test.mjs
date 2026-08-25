import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

let PGlite = null;
let pgcrypto = null;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch {
  // The structural test remains mandatory when the optional runtime is unavailable.
}

const bootstrap = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), '')
  )
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant execute on function auth.jwt() to authenticated;
`;

const saveSql = `
select * from public.platform_save_customized_project_draft_v2(
  $1::uuid,
  null::uuid,
  $2::uuid,
  'cupid-wedding-trial',
  '2026.08',
  'buyout',
  'Zimin',
  'Anrong',
  '2026-08-16'::date,
  'Bali',
  80,
  'estate',
  'romantic',
  array['secret-missions','host-toolkit']::text[],
  'runtime test',
  $3::jsonb
)
`;

const collaboratorSaveSql = `
select * from public.platform_save_customized_project_draft_v3(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  'cupid-wedding-trial',
  '2026.08',
  'buyout',
  'Zimin',
  'Anrong',
  '2026-08-16'::date,
  'Bali',
  80,
  'estate',
  'romantic',
  array['secret-missions','host-toolkit']::text[],
  'collaborator runtime test',
  $4::jsonb
)
`;

test(
  'platform SQL runtime keeps saves owner-scoped, versioned, audited and idempotent',
  { skip: PGlite && pgcrypto ? false : 'requires optional @electric-sql/pglite' },
  async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    const ownerOne = '10000000-0000-4000-8000-000000000001';
    const ownerTwo = '10000000-0000-4000-8000-000000000002';
    const operator = '10000000-0000-4000-8000-000000000003';
    const draftId = '20000000-0000-4000-8000-000000000001';
    const eventOne = '30000000-0000-4000-8000-000000000001';
    const eventTwo = '30000000-0000-4000-8000-000000000002';
    const eventThree = '30000000-0000-4000-8000-000000000003';
    const eventFour = '30000000-0000-4000-8000-000000000004';
    const eventFive = '30000000-0000-4000-8000-000000000005';
    const eventSix = '30000000-0000-4000-8000-000000000006';
    const eventSeven = '30000000-0000-4000-8000-000000000007';
    const eventEight = '30000000-0000-4000-8000-000000000008';
    const eventNine = '30000000-0000-4000-8000-000000000009';
    const eventTen = '30000000-0000-4000-8000-000000000010';
    const eventEleven = '30000000-0000-4000-8000-000000000011';
    const eventTwelve = '30000000-0000-4000-8000-000000000012';
    const eventThirteen = '30000000-0000-4000-8000-000000000013';
    const eventFourteen = '30000000-0000-4000-8000-000000000014';
    const eventFifteen = '30000000-0000-4000-8000-000000000015';
    const eventSixteen = '30000000-0000-4000-8000-000000000016';
    const eventSeventeen = '30000000-0000-4000-8000-000000000017';
    const eventEighteen = '30000000-0000-4000-8000-000000000018';
    const eventNineteen = '30000000-0000-4000-8000-000000000019';
    const secondDraftId = '20000000-0000-4000-8000-000000000002';
    const inviteHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const secondInviteHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const contentBrief = JSON.stringify({
      language: 'bilingual',
      interaction: 'immersive',
      guestMix: 'friends',
      storyMoments: 'Met while diving',
      avoidTopics: 'No former relationships',
      boundariesConfirmed: true,
      hostNotes: 'Keep the finale after dinner',
    });

    try {
      await db.exec(bootstrap);
      const migrationsUrl = new URL('../platform-control-plane/migrations/', import.meta.url);
      const migrations = (await readdir(migrationsUrl)).filter((name) => name.endsWith('.sql')).sort();
      for (const migration of migrations) await db.exec(await readFile(new URL(migration, migrationsUrl), 'utf8'));
      await db.query('insert into auth.users(id) values ($1), ($2), ($3)', [ownerOne, ownerTwo, operator]);
      await db.query("insert into platform_staff(user_id, role) values ($1, 'operator')", [operator]);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');

      const first = await db.query(saveSql, [eventOne, draftId, contentBrief]);
      assert.equal(first.rows[0].current_version, 1);
      const projectId = first.rows[0].id;

      const retry = await db.query(saveSql, [eventOne, draftId, contentBrief]);
      assert.equal(retry.rows[0].id, projectId);
      assert.equal(retry.rows[0].current_version, 1);

      const second = await db.query(saveSql, [eventTwo, draftId, contentBrief]);
      assert.equal(second.rows[0].id, projectId);
      assert.equal(second.rows[0].current_version, 2);

      await assert.rejects(
        db.query(saveSql, [eventThree, draftId, JSON.stringify({ language: 'invalid' })]),
        /platform_project_invalid/,
      );

      await db.exec('reset role');
      await db.query(`update platform_projects set content_brief = jsonb_set(content_brief, '{boundariesConfirmed}', 'false'::jsonb) where id = $1`, [projectId]);
      await db.exec('set role authenticated');
      await assert.rejects(
        db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventFour, projectId]),
        /platform_project_not_ready/,
      );

      await db.exec('reset role');
      await db.query(`update platform_projects set content_brief = jsonb_set(content_brief, '{boundariesConfirmed}', 'true'::jsonb) where id = $1`, [projectId]);
      await db.exec('set role authenticated');
      const submitted = await db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventFour, projectId]);
      assert.equal(submitted.rows[0].status, 'content_review');
      assert.equal(submitted.rows[0].current_version, 3);
      const submitRetry = await db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventFour, projectId]);
      assert.equal(submitRetry.rows[0].current_version, 3);
      await assert.rejects(
        db.query(saveSql, [eventFive, draftId, contentBrief]),
        /platform_project_locked/,
      );
      await assert.rejects(
        db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventOne, projectId]),
        /platform_event_conflict/,
      );

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.exec('set role authenticated');
      const isolated = await db.query('select count(*)::int count from platform_projects');
      assert.equal(isolated.rows[0].count, 0);
      await assert.rejects(
        db.query("select * from platform_review_project($1::uuid, $2::uuid, 'approved', '')", [eventSix, projectId]),
        /platform_staff_required/,
      );

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [operator]);
      await db.exec('set role authenticated');
      const operatorVisible = await db.query('select count(*)::int count from platform_projects');
      assert.equal(operatorVisible.rows[0].count, 1);
      const changesRequested = await db.query(
        "select * from platform_review_project($1::uuid, $2::uuid, 'changes_requested', $3)",
        [eventSix, projectId, 'Please clarify the host notes'],
      );
      assert.equal(changesRequested.rows[0].status, 'draft');
      assert.equal(changesRequested.rows[0].current_version, 4);
      const changesRetry = await db.query(
        "select * from platform_review_project($1::uuid, $2::uuid, 'changes_requested', $3)",
        [eventSix, projectId, 'Please clarify the host notes'],
      );
      assert.equal(changesRetry.rows[0].review_id, changesRequested.rows[0].review_id);
      assert.equal(changesRetry.rows[0].current_version, 4);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');
      const revised = await db.query(saveSql, [eventSeven, draftId, contentBrief]);
      assert.equal(revised.rows[0].current_version, 5);
      const resubmitted = await db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventEight, projectId]);
      assert.equal(resubmitted.rows[0].status, 'content_review');
      assert.equal(resubmitted.rows[0].current_version, 6);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [operator]);
      await db.exec('set role authenticated');
      const approved = await db.query(
        "select * from platform_review_project($1::uuid, $2::uuid, 'approved', $3)",
        [eventNine, projectId, 'Content approved for isolated instance preparation'],
      );
      assert.equal(approved.rows[0].status, 'provisioning');
      assert.equal(approved.rows[0].current_version, 7);
      const approvalRetry = await db.query(
        "select * from platform_review_project($1::uuid, $2::uuid, 'approved', $3)",
        [eventNine, projectId, 'Content approved for isolated instance preparation'],
      );
      assert.equal(approvalRetry.rows[0].review_id, approved.rows[0].review_id);
      assert.equal(approvalRetry.rows[0].current_version, 7);

      await db.exec('reset role');
      const counts = await db.query(`
        select
          (select count(*)::int from platform_projects) projects,
          (select count(*)::int from platform_project_versions) versions,
          (select count(*)::int from platform_entitlements) entitlements,
          (select count(*)::int from platform_audit_log) audits,
          (select count(*)::int from platform_mutation_receipts) receipts,
          (select count(*)::int from platform_project_reviews) reviews,
          (select decision from platform_project_reviews order by review_round desc limit 1) latest_decision,
          (select content_brief ->> 'language' from platform_projects limit 1) language,
          (select snapshot -> 'content_brief' ->> 'interaction' from platform_project_versions order by version desc limit 1) interaction
      `);
      assert.deepEqual(counts.rows[0], { projects: 1, versions: 7, entitlements: 1, audits: 7, receipts: 7, reviews: 2, latest_decision: 'approved', language: 'bilingual', interaction: 'immersive' });

      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.exec('set role authenticated');
      const isolatedReviews = await db.query('select count(*)::int count from platform_project_reviews');
      assert.equal(isolatedReviews.rows[0].count, 0);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');
      const ownerReviews = await db.query('select count(*)::int count from platform_project_reviews');
      assert.equal(ownerReviews.rows[0].count, 2);

      const invitation = await db.query(
        "select * from platform_create_project_invitation($1::uuid, $2::uuid, 'editor', $3)",
        [eventTen, projectId, inviteHash],
      );
      assert.equal(invitation.rows[0].role, 'editor');
      const invitationRetry = await db.query(
        "select * from platform_create_project_invitation($1::uuid, $2::uuid, 'editor', $3)",
        [eventTen, projectId, inviteHash],
      );
      assert.equal(invitationRetry.rows[0].id, invitation.rows[0].id);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.query(`select set_config('request.jwt.claim.email', $1, false)`, ['collaborator@example.com']);
      await db.exec('set role authenticated');
      const accepted = await db.query(
        'select * from platform_accept_project_invitation($1::uuid, $2)',
        [eventEleven, inviteHash],
      );
      assert.equal(accepted.rows[0].project_id, projectId);
      assert.equal(accepted.rows[0].role, 'editor');
      const collaboratorVisible = await db.query('select count(*)::int count from platform_projects');
      assert.equal(collaboratorVisible.rows[0].count, 1);
      const collaboratorReviews = await db.query('select count(*)::int count from platform_project_reviews');
      assert.equal(collaboratorReviews.rows[0].count, 2);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');
      const removed = await db.query(
        'select * from platform_remove_project_member($1::uuid, $2::uuid, $3::uuid)',
        [eventTwelve, projectId, ownerTwo],
      );
      assert.equal(removed.rows[0].user_id, ownerTwo);

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.exec('set role authenticated');
      const collaboratorRevoked = await db.query('select count(*)::int count from platform_projects');
      assert.equal(collaboratorRevoked.rows[0].count, 0);

      await db.exec('reset role');
      const collaborationCounts = await db.query(`
        select
          (select count(*)::int from platform_project_members) members,
          (select count(*)::int from platform_project_invitations) invitations,
          (select count(*)::int from platform_audit_log) audits,
          (select count(*)::int from platform_mutation_receipts) receipts
      `);
      assert.deepEqual(collaborationCounts.rows[0], { members: 0, invitations: 1, audits: 10, receipts: 10 });

      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');
      const secondProject = await db.query(saveSql, [eventThirteen, secondDraftId, contentBrief]);
      const secondProjectId = secondProject.rows[0].id;
      const secondInvitation = await db.query(
        "select * from platform_create_project_invitation($1::uuid, $2::uuid, 'editor', $3)",
        [eventFourteen, secondProjectId, secondInviteHash],
      );
      assert.equal(secondInvitation.rows[0].role, 'editor');

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerTwo]);
      await db.query(`select set_config('request.jwt.claim.email', $1, false)`, ['collaborator@example.com']);
      await db.exec('set role authenticated');
      await db.query('select * from platform_accept_project_invitation($1::uuid, $2)', [eventFifteen, secondInviteHash]);
      const collaboratorSave = await db.query(collaboratorSaveSql, [eventSixteen, secondProjectId, secondDraftId, contentBrief]);
      assert.equal(collaboratorSave.rows[0].current_version, 2);
      const collaboratorSaveRetry = await db.query(collaboratorSaveSql, [eventSixteen, secondProjectId, secondDraftId, contentBrief]);
      assert.equal(collaboratorSaveRetry.rows[0].current_version, 2);
      await assert.rejects(
        db.query('select * from platform_submit_project_for_review($1::uuid, $2::uuid)', [eventSeventeen, secondProjectId]),
        /platform_project_not_owned/,
      );

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ownerOne]);
      await db.exec('set role authenticated');
      await db.query('select * from platform_remove_project_member($1::uuid, $2::uuid, $3::uuid)', [eventEighteen, secondProjectId, ownerTwo]);

      await assert.rejects(
        db.query('select * from platform_lock_provisioning_manifest($1::uuid, $2::uuid)', [eventNineteen, projectId]),
        /platform_staff_required/,
      );

      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [operator]);
      await db.exec('set role authenticated');
      const manifest = await db.query(
        'select * from platform_lock_provisioning_manifest($1::uuid, $2::uuid)',
        [eventNineteen, projectId],
      );
      assert.equal(manifest.rows[0].project_version, 7);
      assert.match(manifest.rows[0].manifest_hash, /^[0-9a-f]{64}$/);
      assert.equal(manifest.rows[0].manifest.schemaVersion, 'wedding-instance-config/v1');
      assert.equal(manifest.rows[0].manifest.wedding.displayName, 'Zimin & Anrong');
      assert.deepEqual(manifest.rows[0].manifest.safeguards, {
        containsCredentials: false,
        containsGuestRuntimeData: false,
        containsPrivateStoryNotes: false,
      });
      const serializedManifest = JSON.stringify(manifest.rows[0].manifest);
      for (const forbidden of ['storyMoments', 'avoidTopics', 'hostNotes', 'runtime test', 'No former relationships']) {
        assert.equal(serializedManifest.includes(forbidden), false);
      }
      const manifestRetry = await db.query(
        'select * from platform_lock_provisioning_manifest($1::uuid, $2::uuid)',
        [eventNineteen, projectId],
      );
      assert.equal(manifestRetry.rows[0].manifest_hash, manifest.rows[0].manifest_hash);

      await db.exec('reset role');
      await db.query('delete from auth.users where id = $1', [operator]);
      const retainedAudit = await db.query(`
        select
          (select count(*)::int from platform_project_versions) versions,
          (select count(*)::int from platform_project_reviews) reviews,
          (select count(*)::int from platform_audit_log) audits,
          (select count(*)::int from platform_project_versions where actor_user_id is null) anonymous_versions,
          (select count(*)::int from platform_project_reviews where reviewer_user_id is null) anonymous_reviews,
          (select count(*)::int from platform_audit_log where actor_user_id is null) anonymous_audits
      `);
      assert.deepEqual(retainedAudit.rows[0], { versions: 9, reviews: 2, audits: 16, anonymous_versions: 2, anonymous_reviews: 2, anonymous_audits: 3 });
    } finally {
      try { await db.exec('reset role'); } catch {}
      await db.close();
    }
  },
);
