import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const requireRuntime = process.env.WEDDING_REQUIRE_SQL_RUNTIME === '1';

let PGlite = null;
let pgcrypto = null;
let runtimeImportError = null;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto'));
} catch (error) {
  runtimeImportError = error;
}

if (requireRuntime && (!PGlite || !pgcrypto)) {
  throw new Error(
    `WEDDING_REQUIRE_SQL_RUNTIME=1 but @electric-sql/pglite is unavailable: ${runtimeImportError?.message ?? 'unknown error'}`,
  );
}

const bootstrap = `
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid,
  bucket_id text not null,
  name text not null,
  updated_at timestamptz not null default now(),
  unique(bucket_id, name)
);
`;

// The repository migration history begins from the already-created production
// guest roster; the original 32 names were intentionally never stored in
// schema.sql. Recreate only those legacy login identifiers in the disposable
// runtime immediately before the roster-normalization migration. This is test
// scaffolding, not production seed data, and contains no credentials.
const legacyRosterLoginNames = [
  'Andao Chen', 'Anrong', 'April Huijie Huang', 'Feifei Xie',
  'Florence Yirui Zhang', 'Huimin Xu', 'Tang-Ling Yeh', 'Tracey',
  'Wenli Xu', 'Yi Ren', 'Yue Liu', 'Zikun Zheng', 'Zimin Jin',
  'Yifan Yu', 'Junheng Liu', 'Gang Yao', 'Luyi Sun', 'Ruochen Xu',
  'Moshuang Xu', 'Siran Li', 'Danying Yang', 'Chulan Fan',
  'Qianyi Wang', 'Zixi Wang', 'Liying Jin', 'Jialai Jin',
  'Jianjun Jin', 'Xingcheng Jin', 'Xiaofeng Jin', 'Ziyang Jin',
  'Wei Jin', 'Fangzhou Chen',
];

const scalar = async (db, sql, params = []) => {
  const result = await db.query(sql, params);
  const row = result.rows[0];
  return row ? Object.values(row)[0] : undefined;
};

const expectDatabaseError = async (operation, expectedMessage) => {
  await assert.rejects(operation, (error) => {
    assert.match(String(error?.message ?? error), new RegExp(expectedMessage));
    return true;
  });
};

test(
  'real PostgreSQL runtime executes the migration chain and enforces wedding lifecycle invariants',
  { skip: PGlite && pgcrypto ? false : 'requires optional @electric-sql/pglite; run npm run test:sql to make absence a failure' },
  async () => {
    const db = new PGlite({ extensions: { pgcrypto } });
    try {
      await db.exec(bootstrap);
      await db.exec(await readFile(new URL('supabase/schema.sql', root), 'utf8'));

      const migrationNames = (await readdir(new URL('supabase/migrations/', root)))
        .filter((name) => name.endsWith('.sql'))
        .sort();
      const retirementMigration = '202608130025_retire_nonofficial_live_assignments.sql';
      const retirementIndex = migrationNames.indexOf(retirementMigration);
      assert.ok(retirementIndex >= 0, 'official assignment retirement migration must be present');

      for (const name of migrationNames.slice(0, retirementIndex)) {
        if (name === '202607290041_final_roster_participation.sql') {
          for (const loginName of legacyRosterLoginNames) {
            await db.query(
              `insert into guests(name,login_name) values($1,$1)`,
              [loginName],
            );
          }
        }
        await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8'));
      }

      // Reproduce a stale, coded rehearsal task just before the hard retirement
      // migration. Live catalogue guards intentionally allow this only while
      // the explicit demo mode is active.
      const guestId = await scalar(
        db,
        `select id from guests
         where active and uses_app and eligible_for_mission
         order by id limit 1`,
      );
      assert.ok(guestId, 'the migration chain must preserve the wedding roster');
      await db.query(`update game_state set task_catalog_mode='demo' where id=1`);
      const legacyTaskId = await scalar(
        db,
        `insert into tasks(title,description,mission_code,active,formal_allowed)
         values('婚礼记者','legacy rehearsal task','LEGACY-REPORTER',true,false)
         returning id`,
      );
      const legacyAssignmentId = await scalar(
        db,
        `insert into assignments(guest_id,task_id,status)
         values($1,$2,'assigned') returning id`,
        [guestId, legacyTaskId],
      );
      await db.query(`update game_state set task_catalog_mode='live' where id=1`);

      let preResetClueId = null;
      let postResetClueId = null;
      for (const name of migrationNames.slice(retirementIndex)) {
        if (name === '202608140010_reconcile_pre_reset_clue_library.sql') {
          const clueGuestId = await scalar(
            db,
            `select id from guests
             where active and eligible_for_secret_role
             order by id limit 1`,
          );
          assert.ok(clueGuestId, 'the migration chain must retain a clue-eligible competitive guest');
          preResetClueId = await scalar(
            db,
            `insert into clues(content,title,created_at)
             values('old run fixture','old clue','2020-01-01T00:00:00Z') returning id`,
          );
          await db.query(
            `insert into guest_clues(guest_id,clue_id,granted_by,created_at)
             values($1,$2,'runtime-test','2020-01-01T12:00:00Z')`,
            [clueGuestId, preResetClueId],
          );
          await db.query(
            `insert into audit_log(actor,action,target_type,target_id,details,created_at)
             values('runtime-test','rehearsal.reset','game_state','1','{}'::jsonb,'2020-01-02T00:00:00Z')`,
          );
          postResetClueId = await scalar(
            db,
            `insert into clues(content,title,created_at)
             values('current run fixture','current clue','2020-01-03T00:00:00Z') returning id`,
          );
        }
        await db.exec(await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8'));
      }

      const exposedDefinerFunctions = (await db.query(
        `select p.oid::regprocedure::text signature
         from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prosecdef
           and (
             has_function_privilege('anon',p.oid,'EXECUTE')
             or has_function_privilege('authenticated',p.oid,'EXECUTE')
           )
         order by 1`,
      )).rows;
      assert.deepEqual(
        exposedDefinerFunctions,
        [],
        'no security-definer wedding RPC may be callable by browser database roles',
      );

      const unpinnedDefinerFunctions = (await db.query(
        `select p.oid::regprocedure::text signature
         from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.prosecdef
           and not exists (
             select 1 from unnest(coalesce(p.proconfig,array[]::text[])) setting
             where setting like 'search_path=%'
           )
         order by 1`,
      )).rows;
      assert.deepEqual(
        unpinnedDefinerFunctions,
        [],
        'every security-definer wedding RPC must pin its search path',
      );

      const browserAccessibleTables = (await db.query(
        `select c.oid::regclass::text relation
         from pg_class c
         join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and c.relkind in ('r','p','v','m','S')
           and (
             has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
             or has_table_privilege('anon',c.oid,'DELETE,TRUNCATE,TRIGGER')
             or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
             or has_table_privilege('authenticated',c.oid,'DELETE,TRUNCATE,TRIGGER')
           )
         order by 1`,
      )).rows;
      assert.deepEqual(
        browserAccessibleTables,
        [],
        'browser database roles must not read or mutate wedding tables directly',
      );

      assert.equal(
        Number(await scalar(db, `select count(*) from clues where id=$1`, [preResetClueId])),
        0,
        'a clue created before the latest reset is reconciled',
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from guest_clues where clue_id=$1`, [preResetClueId])),
        0,
        'an issued row for a pre-reset clue is reconciled first',
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from clues where id=$1`, [postResetClueId])),
        1,
        'a clue created after the latest reset is preserved',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from audit_log
           where actor='migration:202608140010'
             and action='clue_library.pre_reset_reconciled'
             and details->>'applied'='true'
             and details->>'deleted_clue_rows'='1'`,
        )),
        1,
        'the bounded cleanup is audited without clue contents',
      );

      assert.equal(
        await scalar(
          db,
          `select has_function_privilege(
            'service_role','public.approve_assignment(uuid,text,text)','EXECUTE'
          )`,
        ),
        false,
        'the service role cannot bypass rehearsal-run approval scoping',
      );
      assert.equal(
        await scalar(
          db,
          `select has_function_privilege(
            'service_role',
            'public.approve_assignment_with_verification_for_run(uuid,text,text,uuid)',
            'EXECUTE'
          )`,
        ),
        true,
        'the run-scoped approval wrapper remains the application entry point',
      );

      assert.equal(
        await scalar(db, `select status from assignments where id=$1`, [legacyAssignmentId]),
        'cancelled',
        'the obsolete task assignment must be retired rather than shown to a guest',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from assignments a join tasks t on t.id=a.task_id
           where a.status<>'cancelled' and not is_official_wedding_mission_code(t.mission_code)`,
        )),
        0,
      );

      // Run the real first-act draw for every mission-eligible account, not
      // just the twenty second-act competitors. This proves that the four
      // active family accounts, fixed cast, two deterministic trickster
      // facades and the random pools form one complete 24-account allocation.
      const runId = await scalar(db, `select rehearsal_run_id from game_state where id=1`);
      const finalCompetitiveTeams = (await db.query(
        `select login_name,team,role from guests
         where active and uses_app and participation_mode='ACTIVE_PLAYER'
           and phase_two_eligible
         order by login_name`,
      )).rows;
      assert.deepEqual(
        finalCompetitiveTeams.filter((guest) => guest.team === '沙漠组').map((guest) => guest.login_name),
        ['Chulan Fan','Fangzhou Chen','Jialai Jin','Junheng Liu','Qianyi Wang','Siran Li','Yifan Yu','Yue Liu','Zikun Zheng','Zixi Wang'],
        'the organizer-approved desert team must be locked by the final roster migration',
      );
      assert.deepEqual(
        finalCompetitiveTeams.filter((guest) => guest.team === '海岛组').map((guest) => guest.login_name),
        ['Feifei Xie','Huijie Huang','Luyi Sun','Moshuang Xu','Ruochen Xu','Tang-Ling Yeh','Tianyi Shi','Wenli Xu','Yi Ren','Yirui Zhang'],
        'all other competitive guests must be locked to the island team',
      );
      assert.deepEqual(
        finalCompetitiveTeams.filter((guest) => guest.role === 'spy').map((guest) => guest.login_name),
        ['Fangzhou Chen','Huijie Huang'],
        'Fangzhou and Huijie must be the two preset tricksters',
      );
      const islandSpyId = await scalar(
        db,
        `select id from guests where lower(login_name)='huijie huang'`,
      );
      const desertSpyId = await scalar(
        db,
        `select id from guests where lower(login_name)='fangzhou chen'`,
      );
      await db.query(
        `select set_registration_open_for_run(false,'runtime-test',$1)`,
        [runId],
      );
      await expectDatabaseError(
        () => db.query(
          `select configure_guest_game_profile_for_run($1,'沙漠组','spy','runtime-test',$2)`,
          [islandSpyId, runId],
        ),
        'formal_team_locked',
      );
      await db.query(
        `select configure_guest_game_profile_for_run($1,'海岛组','spy','runtime-test',$2)`,
        [islandSpyId, runId],
      );
      await db.query(
        `select configure_guest_game_profile_for_run($1,'海岛组','guest','runtime-test',$2)`,
        [islandSpyId, runId],
      );
      assert.equal(
        await scalar(db, `select role_locked from guests where id=$1`, [islandSpyId]),
        false,
        'choosing the random identity option must actually unlock the role',
      );
      await db.query(
        `select configure_guest_game_profile_for_run($1,'海岛组','spy','runtime-test',$2)`,
        [islandSpyId, runId],
      );
      await db.query(
        `select configure_guest_game_profile_for_run($1,'沙漠组','spy','runtime-test',$2)`,
        [desertSpyId, runId],
      );
      await expectDatabaseError(
        () => db.query(
          `select configure_guest_story_role_for_run($1,'STAR_HOLDER','runtime-test',$2)`,
          [islandSpyId, runId],
        ),
        'formal_story_cast_locked',
      );
      await expectDatabaseError(
        () => db.query(
          `select configure_phase_two_profile_for_run(
            $1,'EXTRA_VOTE',true,false,false,'','runtime-test',$2
          )`,
          [islandSpyId, runId],
        ),
        'formal_phase_two_profile_locked',
      );
      // The disposable schema starts from a historical open-registration
      // snapshot that predates today's full opening checklist. Restore that
      // fixture flag directly after exercising the pre-opening preset RPC;
      // dedicated preflight tests cover the real opening control itself.
      await db.query(`update game_state set registration_open=true where id=1`);
      await expectDatabaseError(
        () => db.query(
          `select configure_guest_game_profile_for_run($1,'海岛组','guest','runtime-test',$2)`,
          [islandSpyId, runId],
        ),
        'formal_configuration_locked',
      );
      await db.query(
        `update guests set claimed_at=coalesce(claimed_at,now())
         where active and uses_app and participation_mode='ACTIVE_PLAYER'
           and eligible_for_mission`,
      );
      await db.query(
        `insert into guest_sessions(guest_id,token_hash,expires_at)
         select g.id,encode(digest(g.id::text||':runtime-session','sha256'),'hex'),now()+interval '1 day'
         from guests g
         where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
           and g.eligible_for_mission
         on conflict(token_hash) do nothing`,
      );
      const missionPlayers = (await db.query(
        `select id from guests
         where active and uses_app and participation_mode='ACTIVE_PLAYER'
           and eligible_for_mission
         order by login_name`,
      )).rows;
      assert.equal(missionPlayers.length, 23, 'the formal first act has exactly 23 mission accounts');
      for (const player of missionPlayers) {
        await db.query(`select * from draw_guest_card($1,$2)`, [player.id, runId]);
      }
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guests
         where active and uses_app and participation_mode='ACTIVE_PLAYER'
           and eligible_for_mission and drawn_at is not null`,
      )), 23);
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guests g
         where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
           and g.eligible_for_mission
           and (select count(*) from assignments a
                where a.guest_id=g.id and a.is_initial and a.status<>'cancelled')<>1`,
      )), 0, 'every mission account receives exactly one visible first-act card');
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join guests g on g.id=a.guest_id
         where a.status<>'cancelled' and not g.eligible_for_mission`,
      )), 0, 'principals and honor-only family accounts receive no task assignment');
      assert.deepEqual(
        Object.fromEntries((await db.query(
          `select t.mission_code,count(*)::integer count
           from assignments a join tasks t on t.id=a.task_id
           where a.is_initial and a.status<>'cancelled'
           group by t.mission_code order by t.mission_code`,
        )).rows.map((row) => [row.mission_code, row.count])),
        {
          'P1-BONUS-001': 2,
          'P1-BOUQUET-001': 2,
          'P1-CER-001': 1,
          'P1-CER-002': 2,
          'P1-HEART-001': 5,
          'P1-SOCIAL-001': 3,
          'P1-SOCIAL-002': 3,
          'P1-STAR-001': 5,
        },
        'the live first-act allocator matches the approved task sheet exactly',
      );
      assert.deepEqual(
        (await db.query(
          `select lower(g.login_name) login_name,t.mission_code
           from assignments a join guests g on g.id=a.guest_id
           join tasks t on t.id=a.task_id
           where a.is_initial and lower(g.login_name) in(
             'yifan yu','xingcheng jin','andao chen','feifei xie','luyi sun'
           ) order by lower(g.login_name)`,
        )).rows,
        [
          { login_name: 'andao chen', mission_code: 'P1-CER-002' },
          { login_name: 'feifei xie', mission_code: 'P1-BONUS-001' },
          { login_name: 'luyi sun', mission_code: 'P1-BONUS-001' },
          { login_name: 'xingcheng jin', mission_code: 'P1-CER-002' },
          { login_name: 'yifan yu', mission_code: 'P1-CER-001' },
        ],
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guests
         where lower(login_name) in('siran li','moshuang xu')
           and story_role not in('GROOM_CHEERLEADER','BRIDE_CHEERLEADER')`,
      )), 2, 'Siran and Moshuang no longer hold fixed cheerleader roles');
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join guests g on g.id=a.guest_id
         join tasks t on t.id=a.task_id
         where lower(g.login_name) in('siran li','moshuang xu')
           and t.mission_code in('P1-CER-003','P1-CER-004')`,
      )), 0, 'retired cheerleader cards are never assigned');
      assert.deepEqual(
        (await db.query(
          `select g.team,t.mission_code
           from assignments a join guests g on g.id=a.guest_id
           join tasks t on t.id=a.task_id
           where a.is_initial and g.role='spy' order by g.team`,
        )).rows,
        [
          { team: '沙漠组', mission_code: 'P1-SOCIAL-002' },
          { team: '海岛组', mission_code: 'P1-SOCIAL-001' },
        ],
        'each trickster receives the ordinary-looking facade assigned to that team',
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         join guests g on g.id=a.guest_id
         where not a.is_initial and a.status<>'cancelled'
           and t.mission_code='P1-TRICKSTER-001' and g.role='spy'`,
      )), 2, 'both tricksters also receive one private non-initial true mission');

      // Use the real fixed staff-confirmed mission to prove approval awards
      // points only. No assignment completion may grant or create a clue.
      const officialAssignment = (await db.query(
        `select a.id,a.guest_id
         from assignments a join tasks t on t.id=a.task_id
         where t.mission_code='P1-BOUQUET-001' and a.is_initial
         order by a.created_at limit 1`,
      )).rows[0];
      assert.ok(officialAssignment, 'a random bouquet task must exist');
      const officialTaskId = await scalar(
        db,
        `select id from tasks
         where mission_code='P1-BOUQUET-001' and active and formal_allowed limit 1`,
      );
      assert.ok(officialTaskId, 'official first-round task must exist');
      const officialGuestId = officialAssignment.guest_id;
      await db.query(`update game_state set stage='ceremony_end' where id=1`);
      const assignmentId = await scalar(
        db,
        `update assignments set status='submitted',submitted_at=now()
         where guest_id=$1 and task_id=$2 and is_initial
         returning id`,
        [officialGuestId, officialTaskId],
      );
      assert.ok(assignmentId, 'the fixed Siran assignment must come from the real draw');
      const clueId = await scalar(
        db,
        `insert into clues(content,title) values('must survive approval','manual clue') returning id`,
      );
      await db.query(
        `insert into guest_clues(guest_id,clue_id,granted_by) values($1,$2,'runtime-test')`,
        [officialGuestId, clueId],
      );
      const cluesBeforeApproval = Number(await scalar(db, `select count(*) from guest_clues`));
      await db.query(
        `select approve_assignment_with_verification_for_run($1,'runtime-test','现场确认',$2)`,
        [assignmentId, runId],
      );
      assert.equal(Number(await scalar(db, `select count(*) from guest_clues`)), cluesBeforeApproval);
      assert.deepEqual(
        (await db.query(
          `select reward_clue_id,reward_task_id from assignments where id=$1`,
          [assignmentId],
        )).rows[0],
        { reward_clue_id: null, reward_task_id: null },
      );

      // Player-code confirmation is only a fallback completion path. If the
      // assignment finishes elsewhere, its pending invitation closes, and a
      // stale/retried accept is a no-op rather than a second score event.
      const socialFixtures = (await db.query(
        `select a.id assignment_id,a.guest_id,t.points
         from assignments a join tasks t on t.id=a.task_id
         where a.status='assigned' and t.mission_code='P1-SOCIAL-001'
         order by a.created_at,a.id`,
      )).rows;
      assert.equal(socialFixtures.length, 3, 'three new-friend tasks are available for lifecycle regression');

      const staleSocial = socialFixtures[0];
      const staleTarget = (await db.query(
        `select id,player_code from guests
         where active and drawn_at is not null and id<>$1
         order by id limit 1`,
        [staleSocial.guest_id],
      )).rows[0];
      const staleConfirmationId = await scalar(
        db,
        `select request_assignment_mutual_confirmation($1,$2,$3,$4)`,
        [staleSocial.assignment_id, staleSocial.guest_id, staleTarget.player_code, runId],
      );
      await db.query(
        `select complete_assignment_at_station_for_run($1,'runtime-test','photo path won the race',$2)`,
        [staleSocial.assignment_id, runId],
      );
      assert.equal(
        await scalar(db, `select status from assignment_mutual_confirmations where id=$1`, [staleConfirmationId]),
        'REJECTED',
      );
      const stalePointsAfterCompletion = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [staleSocial.guest_id],
      ));
      await db.query(
        `select respond_assignment_mutual_confirmation($1,$2,true,$3)`,
        [staleConfirmationId, staleTarget.id, runId],
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [staleSocial.guest_id])),
        stalePointsAfterCompletion,
        'accepting a stale browser prompt cannot score the completed task again',
      );

      const acceptedSocial = socialFixtures[1];
      const acceptedTarget = (await db.query(
        `select id,player_code from guests
         where active and drawn_at is not null and id<>$1 and id<>$2
         order by id limit 1`,
        [acceptedSocial.guest_id, staleTarget.id],
      )).rows[0];
      const acceptedConfirmationId = await scalar(
        db,
        `select request_assignment_mutual_confirmation($1,$2,$3,$4)`,
        [acceptedSocial.assignment_id, acceptedSocial.guest_id, acceptedTarget.player_code, runId],
      );
      const acceptedPointsBefore = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [acceptedSocial.guest_id],
      ));
      await db.query(
        `select respond_assignment_mutual_confirmation($1,$2,true,$3)`,
        [acceptedConfirmationId, acceptedTarget.id, runId],
      );
      const acceptedPointsAfter = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [acceptedSocial.guest_id],
      ));
      assert.ok(
        acceptedPointsAfter >= acceptedPointsBefore,
        'the first accepted response completes the task without reducing the guest score',
      );
      assert.equal(await scalar(db, `select status from assignments where id=$1`, [acceptedSocial.assignment_id]), 'approved');
      assert.equal(await scalar(db, `select status from assignment_mutual_confirmations where id=$1`, [acceptedConfirmationId]), 'ACTIVE');
      assert.deepEqual(
        (await db.query(
          `select completion_rank,early_bonus_points from assignments where id=$1`,
          [acceptedSocial.assignment_id],
        )).rows[0],
        { completion_rank: null, early_bonus_points: 0 },
        'peer confirmation cannot consume the staff-verified first-three honor',
      );
      await db.query(
        `select respond_assignment_mutual_confirmation($1,$2,true,$3)`,
        [acceptedConfirmationId, acceptedTarget.id, runId],
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [acceptedSocial.guest_id])),
        acceptedPointsAfter,
        'retrying the same accepted response is idempotent',
      );

      const rejectedSocial = socialFixtures[2];
      const rejectedTarget = (await db.query(
        `select id,player_code from guests
         where active and drawn_at is not null and id<>$1 and id<>$2 and id<>$3
         order by id limit 1`,
        [rejectedSocial.guest_id, staleTarget.id, acceptedTarget.id],
      )).rows[0];
      const rejectedConfirmationId = await scalar(
        db,
        `select request_assignment_mutual_confirmation($1,$2,$3,$4)`,
        [rejectedSocial.assignment_id, rejectedSocial.guest_id, rejectedTarget.player_code, runId],
      );
      await db.query(`update game_state set stage='task_round_1' where id=1`);
      await db.query(
        `select respond_assignment_mutual_confirmation($1,$2,false,$3)`,
        [rejectedConfirmationId, rejectedTarget.id, runId],
      );
      assert.equal(
        await scalar(db, `select status from assignment_mutual_confirmations where id=$1`, [rejectedConfirmationId]),
        'REJECTED',
        'a mistaken invitation remains rejectable during the ceremony pause',
      );
      await db.query(`update game_state set stage='ceremony_end' where id=1`);

      // A trickster's ordinary-looking photo assignment must now award its
      // visible two camouflage points without consuming the real guests'
      // staff-verified first-three honor.
      const tricksterFacade = (await db.query(
        `select a.id,a.guest_id,a.status
         from assignments a join tasks t on t.id=a.task_id
         join guests g on g.id=a.guest_id
         where a.is_initial and g.role='spy'
           and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
         order by a.id limit 1`,
      )).rows[0];
      assert.ok(tricksterFacade, 'one trickster facade is available for score regression');
      if (tricksterFacade.status === 'assigned') {
        await db.query(
          `select complete_assignment_at_station_for_run($1,'runtime-test','伪装任务现场确认',$2)`,
          [tricksterFacade.id, runId],
        );
      }
      assert.deepEqual(
        (await db.query(
          `select status,completion_rank,early_bonus_points
           from assignments where id=$1`,
          [tricksterFacade.id],
        )).rows[0],
        { status: 'approved', completion_rank: null, early_bonus_points: 0 },
        'camouflage points do not consume the first-three completion honor',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select coalesce(sum(amount),0) from points_ledger where assignment_id=$1`,
          [tricksterFacade.id],
        )),
        2,
        'the approved facade still contributes two visible personal points',
      );

      // A demo task may reuse a production mechanic, but system completion
      // must select the exact official mission code rather than the oldest
      // same-mechanic row. This recreates the data shape that previously let a
      // stale rehearsal task steal an automatic completion.
      const systemHeartAssignment = (await db.query(
        `select a.id,a.guest_id,t.points
         from assignments a join tasks t on t.id=a.task_id
         where a.is_initial and a.status='assigned'
           and t.mission_code='P1-HEART-001'
         order by a.created_at limit 1`,
      )).rows[0];
      assert.ok(systemHeartAssignment, 'one unfinished official heart mission must exist');
      await db.query(`update game_state set task_catalog_mode='demo' where id=1`);
      const staleHeartTaskId = await scalar(
        db,
        `insert into tasks(
          title,description,verification_method,points,role_scope,category,stage,
          mission_code,mechanic,score_policy,active,formal_allowed
        ) values(
          '旧版爱心任务','runtime stale mechanic','runtime only',5,'all',
          'standard','task_round_1','LEGACY-HEART-RUNTIME','HEART_MATCH',
          'STANDARD',true,false
        ) returning id`,
      );
      const staleHeartAssignmentId = await scalar(
        db,
        `insert into assignments(guest_id,task_id,status,is_initial,created_at)
         values($1,$2,'assigned',false,now()-interval '30 days') returning id`,
        [systemHeartAssignment.guest_id, staleHeartTaskId],
      );
      await db.query(`update game_state set task_catalog_mode='live' where id=1`);
      const heartPointsBefore = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [systemHeartAssignment.guest_id],
      ));
      assert.equal(
        await scalar(
          db,
          `select complete_system_mission(
            $1,'HEART_MATCH','runtime-test','official exact-match regression'
          )`,
          [systemHeartAssignment.guest_id],
        ),
        systemHeartAssignment.id,
      );
      assert.equal(
        await scalar(db, `select status from assignments where id=$1`, [staleHeartAssignmentId]),
        'assigned',
        'the older nonofficial same-mechanic assignment remains untouched',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select points from guests where id=$1`,
          [systemHeartAssignment.guest_id],
        )),
        heartPointsBefore + Number(systemHeartAssignment.points),
      );
      assert.deepEqual(
        (await db.query(
          `select t.mission_code,l.amount
           from points_ledger l
           join assignments a on a.id=l.assignment_id
           join tasks t on t.id=a.task_id
           where l.reason='official exact-match regression'`,
        )).rows,
        [{ mission_code: 'P1-HEART-001', amount: Number(systemHeartAssignment.points) }],
      );

      const desertSpyCode = await scalar(
        db,
        `select player_code from guests where id=$1`,
        [desertSpyId],
      );
      await db.query(
        `select request_player_connection($1,$2,'TRICKSTER_CONNECTION',$3)`,
        [islandSpyId, desertSpyCode, runId],
      );
      const tricksterRelationshipId = await scalar(
        db,
        `select id from player_relationships
         where relationship_type='TRICKSTER_CONNECTION'
           and player_a_id in($1,$2) and player_b_id in($1,$2)
           and status='PENDING'`,
        [islandSpyId, desertSpyId],
      );
      assert.ok(tricksterRelationshipId, 'the first trickster signal creates a private pending invitation');
      await db.query(
        `select accept_player_connection($1,$2,$3)`,
        [desertSpyId, tricksterRelationshipId, runId],
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         where a.guest_id in($1,$2) and a.status='approved'
           and t.mission_code='P1-TRICKSTER-001'`,
        [islandSpyId, desertSpyId],
      )), 2, 'one accepted secret invitation completes both tricksters’ true first-act missions');

      assert.equal(Number(await scalar(
        db,
        `select count(*) from guests where active and uses_app
           and participation_mode='ACTIVE_PLAYER' and phase_two_eligible
           and drawn_at is not null`,
      )), 20);
      assert.equal(Number(await scalar(
        db,
        `select count(*) from (values('海岛组'::text),('沙漠组'::text)) expected(team)
         where (select count(*) from guests g where g.active and g.phase_two_eligible
           and g.drawn_at is not null and g.team=expected.team and g.role='spy')=1`,
      )), 2);
      assert.deepEqual(
        (await db.query(
          `select symbol,count(*)::integer count
           from symbol_pairing_assignments group by symbol order by symbol`,
        )).rows,
        [{ symbol: 'HEART', count: 5 }, { symbol: 'STAR', count: 5 }],
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         join guests g on g.id=a.guest_id
         where a.is_initial and g.active and g.phase_two_eligible and g.role='guest'
           and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')`,
      )), 3);

      const cluesBeforePhaseTwo = Number(await scalar(db, `select count(*) from guest_clues`));
      assert.equal(
        await scalar(db, `select stage from game_state where id=1`),
        'ceremony_end',
        'the second act can only be released after the ceremony has ended',
      );
      await expectDatabaseError(
        () => db.query(
          `select set_game_stage_for_run('banquet','runtime-test',$1)`,
          [runId],
        ),
        'invalid_game_stage_transition',
      );
      assert.equal(
        await scalar(db, `select stage from game_state where id=1`),
        'ceremony_end',
        'a skipped stage must leave the wedding state untouched',
      );
      await db.query(
        `select set_game_stage_for_run('task_round_2','runtime-test',$1)`,
        [runId],
      );
      assert.equal(await scalar(db, `select stage from game_state where id=1`), 'task_round_2');
      assert.equal(await scalar(db, `select phase_two_official_assignment_set_complete()`), true);
      assert.equal(Number(await scalar(db, `select count(*) from phase_two_profiles`)), 20);
      assert.deepEqual(
        (await db.query(
          `select symbol,status,count(*)::integer count
           from symbol_pairing_assignments
           group by symbol,status order by symbol,status`,
        )).rows,
        [
          { symbol: 'HEART', status: 'PAIRED', count: 4 },
          { symbol: 'HEART', status: 'UNPAIRED_FINAL', count: 1 },
          { symbol: 'STAR', status: 'PAIRED', count: 4 },
          { symbol: 'STAR', status: 'UNPAIRED_FINAL', count: 1 },
        ],
        'each five-player symbol pool resolves to two pairs and one awakening',
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*)
         from phase_two_profiles p
         join symbol_pairing_assignments s on s.guest_id=p.guest_id
         join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
         join tasks t on t.id=a.task_id
         where p.primary_mission='COPY_SCORE'
           and s.symbol='HEART' and s.status='UNPAIRED_FINAL'
           and t.mission_code='P2-LONELY-001'`,
      )), 1, 'only the unmatched heart player becomes the lonely Cupid');
      assert.equal(Number(await scalar(
        db,
        `select count(*)
         from phase_two_profiles p
         join symbol_pairing_assignments s on s.guest_id=p.guest_id
         join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
         join tasks t on t.id=a.task_id
         where p.primary_mission='TEAM_CAPTAIN'
           and s.symbol='STAR' and s.status='UNPAIRED_FINAL'
           and t.mission_code='P2-GUIDE-001'`,
      )), 1, 'only the unmatched star player becomes the guiding star');
      assert.equal(Number(await scalar(
        db,
        `select count(*)
         from phase_two_profiles p
         join symbol_pairing_assignments s on s.guest_id=p.guest_id
         join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
         join tasks t on t.id=a.task_id
         where p.primary_mission='HEART_DILEMMA'
           and s.symbol='HEART' and s.status='PAIRED'
           and t.mission_code='P2-HEART-001'`,
      )), 4);
      assert.equal(Number(await scalar(
        db,
        `select count(*)
         from phase_two_profiles p
         join symbol_pairing_assignments s on s.guest_id=p.guest_id
         join assignments a on a.guest_id=p.guest_id and a.status<>'cancelled'
         join tasks t on t.id=a.task_id
         where p.primary_mission='STAR_DILEMMA'
           and s.symbol='STAR' and s.status='PAIRED'
           and t.mission_code='P2-STAR-001'`,
      )), 4);
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         where a.status<>'cancelled' and t.stage='task_round_2'
           and is_official_wedding_mission_code(t.mission_code)`,
      )), 20, 'all twenty phase-two players receive exactly one primary card');
      assert.equal(Number(await scalar(
        db,
        `select count(*) from phase_two_profiles p join guests g on g.id=p.guest_id
         join assignments a on a.guest_id=p.guest_id and a.status='approved'
         join tasks t on t.id=a.task_id
         where p.super_lucky and p.lucky_bonus_settled_at is not null
           and lower(g.login_name) in('feifei xie','luyi sun')
           and t.mission_code='P2-LUCKY-001'`,
      )), 2, 'both fixed first-act lucky stars receive settled act-two lucky cards');
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         join phase_two_profiles p on p.guest_id=a.guest_id
         where t.mission_code='P2-POWER-001' and a.status='approved'
           and p.primary_mission='EXTRA_VOTE' and p.extra_vote`,
      )), 2);
      const phaseTwoAssignmentCount = Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         where a.status<>'cancelled' and t.stage='task_round_2'
           and is_official_wedding_mission_code(t.mission_code)`,
      ));
      assert.equal(phaseTwoAssignmentCount, 20);
      await db.query(
        `select set_game_stage_for_run('task_round_2','runtime-test',$1)`,
        [runId],
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         where a.status<>'cancelled' and t.stage='task_round_2'
           and is_official_wedding_mission_code(t.mission_code)`,
      )), phaseTwoAssignmentCount, 'repeating the current stage must not allocate a second set of tasks');
      assert.equal(
        Number(await scalar(db, `select count(*) from guest_clues`)),
        cluesBeforePhaseTwo,
        'second-act release must not manufacture or auto-grant a clue',
      );

      // The task station is a recovery surface only for staff-verifiable work.
      // Secret choices and automatic powers must remain system-authoritative,
      // while staff photo storage is available only to PHOTO missions.
      const systemAssignmentId = await scalar(
        db,
        `select a.id from assignments a join tasks t on t.id=a.task_id
         where a.status='assigned' and t.mission_code='P2-HEART-001'
         order by a.id limit 1`,
      );
      assert.ok(systemAssignmentId, 'a system-owned heart dilemma must exist');
      await expectDatabaseError(
        () => db.query(
          `select complete_assignment_at_station_for_run($1,'runtime-test','must fail',$2)`,
          [systemAssignmentId, runId],
        ),
        'station_manual_completion_forbidden',
      );
      assert.equal(
        await scalar(db, `select status from assignments where id=$1`, [systemAssignmentId]),
        'assigned',
        'a rejected station request cannot change a system-owned mission',
      );
      await expectDatabaseError(
        () => db.query(
          `select authorize_staff_assignment_evidence_upload_for_run($1,$2)`,
          [systemAssignmentId, runId],
        ),
        'station_photo_evidence_forbidden',
      );

      const photoAssignment = (await db.query(
        `select a.id,a.guest_id from assignments a join tasks t on t.id=a.task_id
         where a.status='assigned' and t.stage='task_round_2'
           and t.verification_type='PHOTO'
         order by a.id limit 1`,
      )).rows[0];
      assert.ok(photoAssignment, 'a staff-verifiable photo mission must exist');
      assert.equal(
        await scalar(
          db,
          `select authorize_staff_assignment_evidence_upload_for_run($1,$2)`,
          [photoAssignment.id, runId],
        ),
        `${photoAssignment.guest_id}/${runId}/${photoAssignment.id}.jpg`,
        'a PHOTO mission keeps the deterministic run-scoped staff upload path',
      );

      // Team clues exist only because the operator created them for this run,
      // and are delivered to every member (including the trickster) only after
      // an explicit, immutable team-score settlement.
      await expectDatabaseError(
        () => db.query(`select set_game_stage_for_run('group_game','runtime-test',$1)`, [runId]),
        'invalid_game_stage_transition',
      );
      await db.query(`select set_game_stage_for_run('banquet','runtime-test',$1)`, [runId]);
      await expectDatabaseError(
        () => db.query(`select set_game_stage_for_run('task_round_2','runtime-test',$1)`, [runId]),
        'invalid_game_stage_transition',
      );

      // Banquet is still an active second-round task window. Exercise the
      // run-scoped public RPCs against the fully migrated function chain so a
      // future wrapper cannot silently drift from the client-side stage rules.
      const heartPair = (await db.query(
        `select least(r.player_a_id,r.player_b_id) player_a_id,
                greatest(r.player_a_id,r.player_b_id) player_b_id
         from player_relationships r
         join phase_two_profiles pa on pa.guest_id=r.player_a_id
         join phase_two_profiles pb on pb.guest_id=r.player_b_id
         where r.relationship_type='CUPID_ALLIANCE' and r.status='ACTIVE'
           and pa.primary_mission='HEART_DILEMMA'
           and pb.primary_mission='HEART_DILEMMA'
         order by r.id limit 1`,
      )).rows[0];
      assert.ok(heartPair, 'a paired heart alliance must receive the heart dilemma');
      const firstHeartSubmission = (await db.query(
        `select submit_phase_two_dilemma($1,'LOVE',$2) result`,
        [heartPair.player_a_id, runId],
      )).rows[0].result;
      assert.equal(firstHeartSubmission.settled, false);
      assert.equal(
        Number(await scalar(db, `select count(*) from points_ledger where reason='第二阶段联盟秘密选择'`)),
        0,
        'the first private choice must not reveal or settle the partner outcome',
      );
      const secondHeartSubmission = (await db.query(
        `select submit_phase_two_dilemma($1,'HATE',$2) result`,
        [heartPair.player_b_id, runId],
      )).rows[0].result;
      assert.equal(secondHeartSubmission.settled, true);
      assert.deepEqual(
        (await db.query(
          `select player_a_points,player_b_points
           from phase_two_dilemmas where alliance_type='HEART'`,
        )).rows,
        [{ player_a_points: 0, player_b_points: 5 }],
      );

      const starPair = (await db.query(
        `select least(r.player_a_id,r.player_b_id) player_a_id,
                greatest(r.player_a_id,r.player_b_id) player_b_id
         from player_relationships r
         join phase_two_profiles pa on pa.guest_id=r.player_a_id
         join phase_two_profiles pb on pb.guest_id=r.player_b_id
         where r.relationship_type='STAR_ALLIANCE' and r.status='ACTIVE'
           and pa.primary_mission='STAR_DILEMMA'
           and pb.primary_mission='STAR_DILEMMA'
         order by r.id limit 1`,
      )).rows[0];
      assert.ok(starPair, 'a paired star alliance must receive the star dilemma');
      await db.query(
        `select submit_phase_two_dilemma($1,'TOGETHER',$2)`,
        [starPair.player_a_id, runId],
      );
      await db.query(
        `select submit_phase_two_dilemma($1,'TOGETHER',$2)`,
        [starPair.player_b_id, runId],
      );
      assert.deepEqual(
        (await db.query(
          `select player_a_points,player_b_points
           from phase_two_dilemmas where alliance_type='STAR'`,
        )).rows,
        [{ player_a_points: 3, player_b_points: 3 }],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from assignments a join tasks t on t.id=a.task_id
           where t.mission_code in('P2-HEART-001','P2-STAR-001')
             and a.guest_id in($1,$2,$3,$4) and a.status='approved'`,
          [heartPair.player_a_id, heartPair.player_b_id, starPair.player_a_id, starPair.player_b_id],
        )),
        4,
      );

      const copyGuestId = await scalar(
        db,
        `select guest_id from phase_two_profiles where primary_mission='COPY_SCORE'`,
      );
      const copyTarget = (await db.query(
        `select p.guest_id,g.team
         from phase_two_profiles p join guests g on g.id=p.guest_id
         where p.primary_mission='TEAM_CAPTAIN'`,
      )).rows[0];
      const copyTargetId = copyTarget?.guest_id;
      const copyTargetTeam = copyTarget?.team;
      assert.ok(copyGuestId && copyTargetId && copyTargetTeam, 'copy mission must have the Guiding Star as a valid target');
      await db.query(
        `select submit_phase_two_copy_choice($1,$2,$3)`,
        [copyGuestId, copyTargetId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from phase_two_copy_choices
           where guest_id=$1 and target_guest_id=$2 and settled_at is null`,
          [copyGuestId, copyTargetId],
        )),
        1,
      );

      await db.query(`select set_game_stage_for_run('group_game','runtime-test',$1)`, [runId]);
      await expectDatabaseError(
        () => db.query(`select set_game_stage_for_run('banquet','runtime-test',$1)`, [runId]),
        'invalid_game_stage_transition',
      );
      const islandClueIds = (await db.query(
        `insert into clues(title,content,group_name,team_scope,active,level)
         values('海岛身份线索','runtime island identity','身份线索','海岛组',true,1),
               ('海岛行动线索','runtime island action','行动线索','海岛组',true,2)
         returning id`,
      )).rows.map((row) => row.id);
      const desertClueIds = (await db.query(
        `insert into clues(title,content,group_name,team_scope,active,level)
         values('沙漠身份线索','runtime desert identity','身份线索','沙漠组',true,1),
               ('沙漠行动线索','runtime desert action','行动线索','沙漠组',true,2)
         returning id`,
      )).rows.map((row) => row.id);
      const islandScoreEvent = await scalar(db, `select gen_random_uuid()`);
      const desertScoreEvent = await scalar(db, `select gen_random_uuid()`);
      const islandFinalScore = copyTargetTeam === '海岛组' ? 7 : 3;
      const desertFinalScore = copyTargetTeam === '沙漠组' ? 7 : 3;
      await db.query(
        `select adjust_staff_team_points_for_run('海岛组',$1,'runtime-station','团队挑战',$2,$3)`,
        [islandFinalScore, islandScoreEvent, runId],
      );
      await db.query(
        `select adjust_staff_team_points_for_run('沙漠组',$1,'runtime-station','团队挑战',$2,$3)`,
        [desertFinalScore, desertScoreEvent, runId],
      );
      assert.equal(Number(await scalar(db, `select count(*) from guest_clues`)), cluesBeforePhaseTwo);
      await db.query(`select settle_phase_two_team_clues_for_run('runtime-test',$1)`, [runId]);
      assert.deepEqual(
        (await db.query(
          `select team,team_score_snapshot->>team score
           from game_state cross join (values('海岛组'::text),('沙漠组'::text)) teams(team)
           where id=1 order by team`,
        )).rows,
        [
          { team: '沙漠组', score: String(desertFinalScore) },
          { team: '海岛组', score: String(islandFinalScore) },
        ],
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guest_clues gc join guests g on g.id=gc.guest_id
         where g.team='海岛组' and gc.clue_id=any($1::uuid[])`,
        [islandClueIds],
      )), islandFinalScore > desertFinalScore ? 20 : 10);
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guest_clues gc join guests g on g.id=gc.guest_id
         where g.team='沙漠组' and gc.clue_id=any($1::uuid[])`,
        [desertClueIds],
      )), desertFinalScore > islandFinalScore ? 20 : 10);
      assert.equal(Number(await scalar(
        db,
        `select count(*) from guest_clues gc join guests g on g.id=gc.guest_id
         where g.role='spy' and gc.clue_id=any($1::uuid[])`,
        [[...islandClueIds, ...desertClueIds]],
      )), 3, 'both tricksters receive every clue won by their own team');

      const settledIslandClueId = islandClueIds[0];
      await expectDatabaseError(
        () => db.query(
          `select deactivate_game_clue_for_run($1,'runtime-test',$2)`,
          [settledIslandClueId, runId],
        ),
        'settled_clue_locked',
      );
      await expectDatabaseError(
        () => db.query(`update clues set active=false where id=$1`, [settledIslandClueId]),
        'settled_clue_locked',
      );
      assert.equal(
        await scalar(db, `select active from clues where id=$1`, [settledIslandClueId]),
        true,
        'a settled clue remains active for lost-response recovery',
      );
      const recoveryGuestId = await scalar(
        db,
        `select g.id from guests g
         join guest_clues gc on gc.guest_id=g.id and gc.clue_id=$1
         where g.team='海岛组' order by g.id limit 1`,
        [settledIslandClueId],
      );
      await db.query(
        `delete from guest_clues where guest_id=$1 and clue_id=$2`,
        [recoveryGuestId, settledIslandClueId],
      );
      await db.query(
        `select grant_guest_clue_for_run($1,$2,'runtime-test',$3)`,
        [recoveryGuestId, settledIslandClueId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from guest_clues where guest_id=$1 and clue_id=$2`,
          [recoveryGuestId, settledIslandClueId],
        )),
        1,
        'the exact settled clue can always be recovered before final publication',
      );
      await expectDatabaseError(
        () => db.query(
          `select adjust_staff_team_points_for_run('海岛组',1,'runtime-station','late score',gen_random_uuid(),$1)`,
          [runId],
        ),
        'team_scores_already_settled|team_scores_locked',
      );

      // An operator reward can legitimately be given during dinner, but it is
      // not part of the target's official P2 mission score and must not be
      // copied by Lonely Cupid at the finale.
      const copyTargetManualEvent = await scalar(db, `select gen_random_uuid()`);
      await db.query(
        `select adjust_staff_guest_points_for_run($1,6,'runtime-station','现场特别表现',$2,$3)`,
        [copyTargetId, copyTargetManualEvent, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select amount from points_ledger where guest_id=$1 and event_key=$2`,
          [copyTargetId, copyTargetManualEvent],
        )),
        6,
      );

      // A family-game victory has a dedicated one-point operation. The server,
      // not the browser, chooses the recipient from the eligible family pool;
      // retries return the same recipient and the team ledger never changes.
      const randomFamilyTeamLedgerBefore = Number(await scalar(db, `select count(*) from team_points_ledger`));
      const randomFamilyEvent = await scalar(db, `select gen_random_uuid()`);
      const randomFamilyAward = JSON.parse(await scalar(
        db,
        `select award_random_family_guest_point_for_run($1,'runtime-host',$2)::text`,
        [randomFamilyEvent, runId],
      ));
      assert.equal(randomFamilyAward.amount, 1);
      assert.equal(randomFamilyAward.replayed, false);
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from guests
           where id=$1 and active and uses_app and eligible_for_personal_score
             and team='家人组'`,
          [randomFamilyAward.guest_id],
        )),
        1,
        'the selected recipient is an eligible family guest',
      );
      const randomFamilyReplay = JSON.parse(await scalar(
        db,
        `select award_random_family_guest_point_for_run($1,'runtime-host',$2)::text`,
        [randomFamilyEvent, runId],
      ));
      assert.equal(randomFamilyReplay.guest_id, randomFamilyAward.guest_id);
      assert.equal(randomFamilyReplay.amount, 1);
      assert.equal(randomFamilyReplay.replayed, true);
      assert.equal(Number(await scalar(db, `select count(*) from points_ledger where event_key=$1`, [randomFamilyEvent])), 1);
      assert.equal(Number(await scalar(db, `select count(*) from team_points_ledger`)), randomFamilyTeamLedgerBefore);
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from audit_log
           where action='host.family_random_point' and target_id=$1
             and details->>'event_key'=$2`,
          [randomFamilyAward.guest_id, randomFamilyEvent],
        )),
        1,
      );
      await expectDatabaseError(
        () => db.query(
          `select award_random_family_guest_point_for_run(gen_random_uuid(),'runtime-host',gen_random_uuid())`,
        ),
        'rehearsal_run_mismatch',
      );

      // Exercise the complete staff scoring contract against real PostgreSQL,
      // including the family-player boundary. Personal adjustments must be
      // retry-safe, audited, and completely isolated from the team ledger.
      const familyGuestId = await scalar(
        db,
        `select id from guests
         where active and uses_app and eligible_for_personal_score
           and team='家人组'
         order by id limit 1`,
      );
      assert.ok(familyGuestId, 'an eligible family guest must remain available for personal scoring');
      const familyPointsBefore = Number(await scalar(db, `select points from guests where id=$1`, [familyGuestId]));
      const teamLedgerBefore = Number(await scalar(db, `select count(*) from team_points_ledger`));
      const staffScoreEvent = await scalar(db, `select gen_random_uuid()`);
      assert.equal(
        Number(await scalar(
          db,
          `select adjust_staff_guest_points_for_run($1,3,'runtime-station','family game reward',$2,$3)`,
          [familyGuestId, staffScoreEvent, runId],
        )),
        familyPointsBefore + 3,
      );
      assert.equal(Number(await scalar(db, `select points from guests where id=$1`, [familyGuestId])), familyPointsBefore + 3);
      assert.equal(Number(await scalar(db, `select count(*) from team_points_ledger`)), teamLedgerBefore);
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from points_ledger
           where guest_id=$1 and event_key=$2 and amount=3 and reason='family game reward'`,
          [familyGuestId, staffScoreEvent],
        )),
        1,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from audit_log
           where action='guest.points_adjust' and target_id=$1
             and details->>'event_key'=$2`,
          [familyGuestId, staffScoreEvent],
        )),
        1,
      );

      // A lost response may be retried without adding a second ledger entry.
      assert.equal(
        Number(await scalar(
          db,
          `select adjust_staff_guest_points_for_run($1,3,'runtime-station','family game reward',$2,$3)`,
          [familyGuestId, staffScoreEvent, runId],
        )),
        familyPointsBefore + 3,
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from points_ledger where event_key=$1`, [staffScoreEvent])),
        1,
      );
      await expectDatabaseError(
        () => db.query(
          `select adjust_staff_guest_points_for_run($1,4,'runtime-station','family game reward',$2,$3)`,
          [familyGuestId, staffScoreEvent, runId],
        ),
        'score_event_conflict',
      );

      const hostScoreEvent = await scalar(db, `select gen_random_uuid()`);
      assert.equal(
        Number(await scalar(
          db,
          `select adjust_host_guest_points_for_run($1,2,'host live reward',$2,'runtime-host',$3)`,
          [familyGuestId, hostScoreEvent, runId],
        )),
        familyPointsBefore + 5,
      );
      assert.equal(Number(await scalar(db, `select count(*) from team_points_ledger`)), teamLedgerBefore);
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from audit_log
           where action='host.guest_points_add' and target_id=$1
             and details->>'event_key'=$2`,
          [familyGuestId, hostScoreEvent],
        )),
        1,
      );

      // Seed every private-data shape that has historically survived an
      // incomplete rehearsal cleanup: an obsolete clue (both in the library
      // and delivered), a selfie object/pointer, task evidence and a mutual
      // confirmation row. The reset assertions below must prove that none of
      // these database references leak into the next run.
      const legacyResetClueId = await scalar(
        db,
        `insert into clues(title,content,group_name,active,level)
         values('旧版彩排线索','这条旧线索必须随清场删除','身份线索',true,1)
         returning id`,
      );
      await db.query(
        `insert into guest_clues(guest_id,clue_id,granted_by)
         values($1,$2,'runtime-old-rehearsal')`,
        [recoveryGuestId, legacyResetClueId],
      );
      const evidenceFixture = (await db.query(
        `select a.id,a.guest_id
         from assignments a join guests g on g.id=a.guest_id
         join tasks t on t.id=a.task_id
         where a.status in('assigned','rejected','submitted')
           and g.active and g.uses_app and g.claimed_at is not null
           and t.category<>'hidden' and t.verification_type='PHOTO'
           and not exists(
             select 1 from assignment_mutual_confirmations c
             where c.assignment_id=a.id
           )
         order by a.created_at desc,a.id limit 1`,
      )).rows[0];
      assert.ok(evidenceFixture, 'one open assignment must be available for reset evidence coverage');
      const avatarFixtureGuestId = evidenceFixture.guest_id;
      const avatarFixturePath = `${avatarFixtureGuestId}/${runId}.jpg`;
      const evidenceFixturePath = `${evidenceFixture.guest_id}/${runId}/${evidenceFixture.id}.jpg`;
      await db.query(
        `insert into storage.objects(id,bucket_id,name)
         values(gen_random_uuid(),'guest-avatars',$1),
               (gen_random_uuid(),'task-evidence',$2)`,
        [avatarFixturePath, evidenceFixturePath],
      );
      await db.query(`select confirm_guest_avatar($1,$2)`, [avatarFixtureGuestId, avatarFixturePath]);
      await db.query(
        `select confirm_assignment_evidence_staff_for_run($1,$2,'runtime-station',$3)`,
        [evidenceFixture.id, evidenceFixturePath, runId],
      );
      const confirmationGuestId = await scalar(
        db,
        `select id from guests where active and uses_app and id<>$1 order by id limit 1`,
        [evidenceFixture.guest_id],
      );
      await db.query(
        `insert into assignment_mutual_confirmations(
           assignment_id,owner_guest_id,confirmer_guest_id,status
         ) values($1,$2,$3,'ACTIVE')`,
        [evidenceFixture.id, evidenceFixture.guest_id, confirmationGuestId],
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from clues where id=$1`, [legacyResetClueId])),
        1,
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from guest_clues where clue_id=$1`, [legacyResetClueId])),
        1,
      );
      assert.equal(
        await scalar(db, `select avatar_path from guests where id=$1`, [avatarFixtureGuestId]),
        avatarFixturePath,
      );
      assert.equal(
        await scalar(db, `select evidence_path from assignments where id=$1`, [evidenceFixture.id]),
        evidenceFixturePath,
      );

      // Exercise the real final ballot and irreversible publication path. The
      // extra-vote ability must change the stored ballot weight (not merely the
      // guest-facing copy). The fixtures force 海岛组 to catch its trickster
      // and 沙漠组 to miss, covering +2, +1 and +0 without touching the frozen
      // team snapshot.
      const extraVoteGuest = (await db.query(
        `select g.id,g.team,g.points
         from phase_two_profiles p join guests g on g.id=p.guest_id
         where p.primary_mission='EXTRA_VOTE' and p.extra_vote
           and p.unlocked_at is not null
           and g.team='海岛组'
         order by g.team limit 1`,
      )).rows[0];
      assert.ok(extraVoteGuest, 'a real extra-vote guest must be unlocked in phase two');
      const teamTricksterId = await scalar(
        db,
        `select id from guests
         where active and drawn_at is not null and role='spy' and team=$1`,
        [extraVoteGuest.team],
      );
      assert.ok(teamTricksterId, 'the extra-vote guest must have one team trickster to vote for');
      const frozenTeamSnapshot = await scalar(
        db,
        `select team_score_snapshot::text from game_state where id=1`,
      );
      const teamLedgerAtSettlement = Number(await scalar(db, `select count(*) from team_points_ledger`));
      const islandSpyPointsBeforeVote = Number(await scalar(db, `select points from guests where id=$1`, [islandSpyId]));
      const desertSpyPointsBeforeVote = Number(await scalar(db, `select points from guests where id=$1`, [desertSpyId]));

      await db.query(
        `select set_game_flag_for_run('voting_open',true,'runtime-test',$1)`,
        [runId],
      );
      const votingRound = Number(await scalar(db, `select voting_round from game_state where id=1`));
      assert.equal(votingRound, 1);
      await db.query(
        `select cast_team_vote($1,$2,$3)`,
        [extraVoteGuest.id, teamTricksterId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select vote_weight from votes
           where voter_guest_id=$1 and voting_round=$2`,
          [extraVoteGuest.id, votingRound],
        )),
        2,
        'extra vote must be persisted as a weighted ballot',
      );
      const islandDecoyId = await scalar(
        db,
        `select id from guests
         where active and drawn_at is not null and team='海岛组'
           and role<>'spy' and id<>$1
         order by id limit 1`,
        [extraVoteGuest.id],
      );
      await db.query(
        `select cast_team_vote($1,$2,$3)`,
        [islandSpyId, islandDecoyId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select vote_weight from votes
           where voter_guest_id=$1 and voting_round=$2`,
          [islandSpyId, votingRound],
        )),
        2,
        'a trickster who completed the true signal mission also receives a real double ballot',
      );
      const desertDecoyId = await scalar(
        db,
        `select id from guests
         where active and drawn_at is not null and team='沙漠组'
           and role<>'spy' and id<>$1
         order by id limit 1`,
        [copyTargetId],
      );
      await db.query(
        `select cast_team_vote($1,$2,$3)`,
        [desertSpyId, desertDecoyId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select vote_weight from votes
           where voter_guest_id=$1 and voting_round=$2`,
          [desertSpyId, votingRound],
        )),
        2,
        'the desert trickster creates a deterministic escaped-team scenario',
      );
      const copyTargetTricksterId = await scalar(
        db,
        `select id from guests
         where active and drawn_at is not null and role='spy' and team=$1`,
        [copyTargetTeam],
      );
      await db.query(
        `select cast_team_vote($1,$2,$3)`,
        [copyTargetId, copyTargetTricksterId, runId],
      );
      assert.equal(
        Number(await scalar(
          db,
          `select vote_weight from votes
           where voter_guest_id=$1 and voting_round=$2`,
          [copyTargetId, votingRound],
        )),
        1,
        'the Guiding Star casts one ordinary ballot',
      );
      await expectDatabaseError(
        () => db.query(
          `select set_game_flag_for_run('results_visible',true,'runtime-test',$1)`,
          [runId],
        ),
        'voting_still_open',
      );
      assert.deepEqual(
        (await db.query(
          `select voting_open,results_visible,results_published_at is not null published
           from game_state where id=1`,
        )).rows[0],
        { voting_open: true, results_visible: false, published: false },
        'an open ballot cannot be atomically closed and published by the finale RPC',
      );
      await db.query(
        `select set_game_flag_for_run('voting_open',false,'runtime-test',$1)`,
        [runId],
      );
      await expectDatabaseError(
        () => db.query(
          `update game_state set voting_open=true,results_visible=true where id=1`,
        ),
        'voting_still_open',
      );
      assert.deepEqual(
        (await db.query(
          `select voting_open,results_visible from game_state where id=1`,
        )).rows[0],
        { voting_open: false, results_visible: false },
        'a direct privileged update cannot publish results into an open-vote state',
      );
      const copyGuestPointsBeforeFinal = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [copyGuestId],
      ));
      const copyTargetPointsBeforeFinal = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [copyTargetId],
      ));
      await db.query(
        `select set_game_flag_for_run('results_visible',true,'runtime-test',$1)`,
        [runId],
      );
      assert.deepEqual(
        (await db.query(
          `select stage,voting_open,results_visible,scoreboard_visible,results_published_at is not null published
           from game_state where id=1`,
        )).rows[0],
        { stage: 'results', voting_open: false, results_visible: true, scoreboard_visible: true, published: true },
        'publishing results opens the public scoreboard once',
      );
      await db.query(
        `select set_game_flag_for_run('scoreboard_visible',false,'runtime-test',$1)`,
        [runId],
      );
      assert.deepEqual(
        (await db.query(
          `select results_visible,scoreboard_visible from game_state where id=1`,
        )).rows[0],
        { results_visible: true, scoreboard_visible: false },
        'operators can close the public screen without undoing final publication',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select amount from result_rewards
           where voting_round=$1 and reward_type='guest_detective'
             and guest_id=$2`,
          [votingRound, extraVoteGuest.id],
        )),
        4,
        'Double Verdict doubles the correct-vote personal reward to four points',
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [extraVoteGuest.id])),
        Number(extraVoteGuest.points) + 4,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select amount from result_rewards
           where voting_round=$1 and reward_type='guest_detective'
             and guest_id=$2`,
          [votingRound, islandSpyId],
        )),
        1,
        'a submitted wrong voter receives one point only when the team catches its trickster',
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [islandSpyId])),
        islandSpyPointsBeforeVote + 1,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select coalesce(sum(amount),0) from result_rewards
           where voting_round=$1 and reward_type='guest_detective'
             and guest_id=$2`,
          [votingRound, desertSpyId],
        )),
        0,
        'a submitted voter receives no reward when the team trickster escapes',
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [desertSpyId])),
        desertSpyPointsBeforeVote,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select coalesce(sum(amount),0) from result_rewards
           where voting_round=$1 and reward_type='guest_detective'
             and guest_id=$2`,
          [votingRound, copyTargetId],
        )),
        copyTargetTeam === '海岛组' ? 2 : 0,
        'the Guiding Star vote reward follows its team capture outcome and is not copyable task score',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select l.amount
           from points_ledger l
           join assignments a on a.id=l.assignment_id
           join tasks t on t.id=a.task_id
           where l.guest_id=$1 and t.mission_code='P2-GUIDE-001'`,
          [copyTargetId],
        )),
        4,
        'the leading Guiding Star receives the official captain reward first',
      );
      const copyGuestVoteReward = Number(await scalar(
        db,
        `select coalesce(sum(amount),0) from result_rewards
         where voting_round=$1 and reward_type='guest_detective'
           and guest_id=$2`,
        [votingRound, copyGuestId],
      ));
      const copyTargetVoteReward = copyTargetTeam === '海岛组' ? 2 : 0;
      assert.equal(
        Number(await scalar(
          db,
          `select settled_points from phase_two_copy_choices where guest_id=$1`,
          [copyGuestId],
        )),
        3,
        'Lonely Cupid transfers exactly three points at the finale',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select l.amount
           from points_ledger l
           join assignments a on a.id=l.assignment_id
           join tasks t on t.id=a.task_id
          where l.guest_id=$1 and t.mission_code='P2-LONELY-001'`,
          [copyGuestId],
        )),
        3,
        'the Lonely Cupid receives the positive side of the transfer once',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select amount from points_ledger
           where guest_id=$1 and assignment_id is null
             and reason='孤单丘比特 · 被偷走 3 分'`,
          [copyTargetId],
        )),
        -3,
        'the locked target receives the exact negative side of the transfer',
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [copyGuestId])),
        copyGuestPointsBeforeFinal + copyGuestVoteReward + 3,
        'the Lonely Cupid total includes its ordinary vote reward plus the transfer',
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [copyTargetId])),
        copyTargetPointsBeforeFinal + copyTargetVoteReward + 4 - 3,
        'the target total includes vote and captain rewards before losing three points',
      );
      const copyGuestPointsAfterFinal = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [copyGuestId],
      ));
      const copyTargetPointsAfterFinal = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [copyTargetId],
      ));
      await db.query(`select settle_phase_two_copy_and_captain('runtime-retry')`);
      assert.deepEqual(
        {
          lonely: Number(await scalar(db, `select points from guests where id=$1`, [copyGuestId])),
          target: Number(await scalar(db, `select points from guests where id=$1`, [copyTargetId])),
          positiveEntries: Number(await scalar(
            db,
            `select count(*) from points_ledger
             where guest_id=$1 and reason='孤单丘比特 · 偷心行动'`,
            [copyGuestId],
          )),
          negativeEntries: Number(await scalar(
            db,
            `select count(*) from points_ledger
             where guest_id=$1 and reason='孤单丘比特 · 被偷走 3 分'`,
            [copyTargetId],
          )),
        },
        {
          lonely: copyGuestPointsAfterFinal,
          target: copyTargetPointsAfterFinal,
          positiveEntries: 1,
          negativeEntries: 1,
        },
        'a finale retry cannot transfer the same three points twice',
      );
      assert.equal(
        await scalar(db, `select team_score_snapshot::text from game_state where id=1`),
        frozenTeamSnapshot,
        'final publication must preserve the frozen team-score snapshot',
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from team_points_ledger`)),
        teamLedgerAtSettlement,
        'voting and publication must not append hidden team rewards',
      );
      assert.equal(Number(await scalar(
        db,
        `select count(*) from assignments a join tasks t on t.id=a.task_id
         where t.mission_code='P2-TRICKSTER-001' and a.status='approved'`,
      )), 2, 'both trickster finale assignments are closed at the reveal');
      assert.equal(
        Number(await scalar(
          db,
          `select count(*)
           from guests g
           left join (
             select guest_id,coalesce(sum(amount),0)::integer ledger_points
             from points_ledger group by guest_id
           ) ledger on ledger.guest_id=g.id
           where g.points<>coalesce(ledger.ledger_points,0)`,
        )),
        0,
        'every materialized personal score must reconcile exactly to its immutable ledger',
      );

      // A successful request whose response was lost remains retryable even
      // after the terminal lock, while every new event is rejected.
      const acceptedPointsAtFinal = Number(await scalar(
        db,
        `select points from guests where id=$1`,
        [acceptedSocial.guest_id],
      ));
      await db.query(
        `select respond_assignment_mutual_confirmation($1,$2,true,$3)`,
        [acceptedConfirmationId, acceptedTarget.id, runId],
      );
      assert.equal(
        Number(await scalar(db, `select points from guests where id=$1`, [acceptedSocial.guest_id])),
        acceptedPointsAtFinal,
        'a lost mutual-confirmation response remains an idempotent no-op after final publication',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select adjust_staff_guest_points_for_run($1,3,'runtime-station','family game reward',$2,$3)`,
          [familyGuestId, staffScoreEvent, runId],
        )),
        familyPointsBefore + 5,
      );
      const randomFamilyReplayAfterFinal = JSON.parse(await scalar(
        db,
        `select award_random_family_guest_point_for_run($1,'runtime-host',$2)::text`,
        [randomFamilyEvent, runId],
      ));
      assert.equal(randomFamilyReplayAfterFinal.guest_id, randomFamilyAward.guest_id);
      assert.equal(randomFamilyReplayAfterFinal.replayed, true);
      assert.equal(Number(await scalar(db, `select count(*) from points_ledger where event_key=$1`, [randomFamilyEvent])), 1);
      await expectDatabaseError(
        () => db.query(
          `select award_random_family_guest_point_for_run(gen_random_uuid(),'runtime-host',$1)`,
          [runId],
        ),
        'final_results_locked',
      );
      await expectDatabaseError(
        () => db.query(
          `select adjust_staff_guest_points_for_run($1,1,'runtime-test','late score',gen_random_uuid(),$2)`,
          [guestId, runId],
        ),
        'final_results_locked',
      );

      const rosterCountBeforeReset = Number(await scalar(db, `select count(*) from guests`));
      assert.equal(rosterCountBeforeReset, 33, 'the complete wedding roster contains 33 shared/player accounts');
      const officialCatalogBeforeReset = await scalar(
        db,
        `select coalesce(jsonb_agg(to_jsonb(t) order by t.mission_code),'[]'::jsonb)::text
         from tasks t where is_official_wedding_mission_code(t.mission_code)`,
      );
      const fixedProfilesBeforeReset = await scalar(
        db,
        `select coalesce(jsonb_agg(jsonb_build_object(
           'id',id,
           'fixed_team',case when team_locked then team end,
           'fixed_role',case when role_locked then role end,
           'fixed_story_role',case when role_locked then story_role end,
           'team_locked',team_locked,'role_locked',role_locked
         ) order by login_name),'[]'::jsonb)::text
         from guests where team_locked or role_locked`,
      );
      assert.ok(JSON.parse(fixedProfilesBeforeReset).length > 0, 'fixed wedding profiles must exist');
      const resetPreview = JSON.parse(await scalar(db, `select preview_rehearsal_reset()::text`));
      for (const field of [
        'claimed_guests', 'drawn_guests', 'assignments', 'evidence_files',
        'avatar_files', 'votes', 'result_rewards', 'guest_clues',
        'clue_library_entries', 'personal_ledger_entries',
        'team_ledger_entries', 'mutual_confirmations', 'symbol_pairings',
        'player_relationships', 'phase_two_profiles',
      ]) {
        assert.ok(Number(resetPreview[field]) > 0, `reset fixture must include ${field}`);
      }

      const resetKey = await scalar(db, `select gen_random_uuid()`);
      const resetSummary = JSON.parse(await scalar(
        db,
        `select reset_rehearsal_data_for_run(
          'RESET WEDDING',true,'runtime regression', $1,'runtime-test',$2
        )::text`,
        [resetKey, runId],
      ));
      assert.equal(resetSummary.database_postconditions_passed, true);
      assert.ok(Number(resetSummary.clue_library_entries) > 0);
      assert.ok(Number(resetSummary.guest_clues) > 0);
      assert.ok(Number(resetSummary.evidence_files) > 0);
      assert.ok(Number(resetSummary.avatar_files) > 0);

      const clearedRuntimeTables = [
        'assignments', 'cupid_helper_actions', 'assignment_mutual_confirmations',
        'symbol_pairing_assignments', 'player_relationships',
        'trickster_signal_attempts', 'phase_two_dilemmas',
        'phase_two_copy_choices', 'phase_two_profiles', 'result_rewards',
        'votes', 'guest_clues', 'clues', 'points_ledger',
        'team_points_ledger', 'spy_points_ledger', 'team_resource_ledger',
        'guest_sessions', 'guest_login_throttles',
        'player_code_attempt_throttles', 'hidden_task_codes',
      ];
      for (const table of clearedRuntimeTables) {
        assert.equal(
          Number(await scalar(db, `select count(*) from ${table}`)),
          0,
          `${table} must be empty after rehearsal reset`,
        );
      }
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from heart_slots where guest_id is not null or assigned_at is not null`,
        )),
        0,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from alliance_clue_fragments
           where active or title<>'丘比特联盟共享线索'
             or left_fragment<>'' or right_fragment<>''`,
        )),
        0,
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from guests
           where avatar_path is not null or avatar_uploaded_at is not null
             or claimed_at is not null or drawn_at is not null or points<>0`,
        )),
        0,
        'all guest runtime pointers and materialized scores are cleared',
      );
      assert.equal(Number(await scalar(db, `select count(*) from guests`)), 33);
      assert.equal(
        await scalar(
          db,
          `select coalesce(jsonb_agg(to_jsonb(t) order by t.mission_code),'[]'::jsonb)::text
           from tasks t where is_official_wedding_mission_code(t.mission_code)`,
        ),
        officialCatalogBeforeReset,
        'the versioned official task catalogue survives reset byte-for-byte',
      );
      assert.equal(
        await scalar(
          db,
          `select coalesce(jsonb_agg(jsonb_build_object(
             'id',id,
             'fixed_team',case when team_locked then team end,
             'fixed_role',case when role_locked then role end,
             'fixed_story_role',case when role_locked then story_role end,
             'team_locked',team_locked,'role_locked',role_locked
           ) order by login_name),'[]'::jsonb)::text
           from guests where team_locked or role_locked`,
        ),
        fixedProfilesBeforeReset,
        'fixed teams and roles survive reset unchanged',
      );
      assert.deepEqual(
        (await db.query(
          `select evidence_paths,avatar_paths from rehearsal_resets where event_key=$1`,
          [resetKey],
        )).rows[0],
        { evidence_paths: [evidenceFixturePath], avatar_paths: [avatarFixturePath] },
        'private-object cleanup inventory keeps both rehearsal file paths',
      );
      assert.equal(
        Number(await scalar(
          db,
          `select count(*) from audit_log where action='rehearsal.reset'
             and actor='runtime-test'
             and details->>'clue_library_cleared'='true'
             and details->>'database_postconditions_passed'='true'`,
        )),
        1,
        'the reset leaves one explicit audited clearing record',
      );
      assert.deepEqual(
        (await db.query(
          `select stage,voting_open,results_visible,results_published_at,
             team_score_snapshot,team_clues_settled_at
           from game_state where id=1`,
        )).rows[0],
        {
          stage: 'registration',
          voting_open: false,
          results_visible: false,
          results_published_at: null,
          team_score_snapshot: null,
          team_clues_settled_at: null,
        },
      );

      const newRunId = await scalar(db, `select rehearsal_run_id from game_state where id=1`);
      assert.notEqual(newRunId, runId);
      await expectDatabaseError(
        () => db.query(
          `select set_guest_phase_note_for_run('stale','runtime-test',$1)`,
          [runId],
        ),
        'rehearsal_run_mismatch',
      );
      await db.query(
        `select set_guest_phase_note_for_run('current','runtime-test',$1)`,
        [newRunId],
      );
      assert.equal(await scalar(db, `select phase_note from game_state where id=1`), 'current');

      // A lost reset response can be retried with the same event key even
      // though the successful reset rotated rehearsal_run_id.
      await db.query(
        `select reset_rehearsal_data_for_run(
          'RESET WEDDING',true,'runtime regression',$1,'runtime-test',$2
        )`,
        [resetKey, runId],
      );
      await expectDatabaseError(
        () => db.query(
          `select reset_rehearsal_data_for_run(
            null,true,'runtime regression',$1,'runtime-test',$2
          )`,
          [resetKey, runId],
        ),
        'reset_event_conflict',
      );

      // A real 0:0 challenge is an explicit result, but it is not a joint
      // first place. Both teams receive the one-clue participation baseline;
      // neither team receives the extra first-place clue or captain reward.
      await db.query(
        `update guests set claimed_at=coalesce(claimed_at,now()),drawn_at=now(),
           role='guest',is_hidden_spy=false
         where active and uses_app and participation_mode='ACTIVE_PLAYER'
           and phase_two_eligible and team in('海岛组','沙漠组')`,
      );
      const zeroIslandSpyId = await scalar(
        db,
        `select id from guests where active and drawn_at is not null
           and phase_two_eligible and team='海岛组' order by id limit 1`,
      );
      const zeroDesertSpyId = await scalar(
        db,
        `select id from guests where active and drawn_at is not null
           and phase_two_eligible and team='沙漠组' order by id limit 1`,
      );
      await db.query(`update guests set role='spy' where id in($1,$2)`, [zeroIslandSpyId, zeroDesertSpyId]);
      await db.query(`update game_state set stage='group_game' where id=1`);
      await db.query(
        `insert into clues(title,content,group_name,team_scope,spy_guest_id,active,level)
         values('零分海岛线索','zero island','身份线索','海岛组',$1,true,1),
               ('零分沙漠线索','zero desert','身份线索','沙漠组',$2,true,1)`,
        [zeroIslandSpyId, zeroDesertSpyId],
      );
      const zeroIslandEvent = await scalar(db, `select gen_random_uuid()`);
      const zeroDesertEvent = await scalar(db, `select gen_random_uuid()`);
      await db.query(
        `select adjust_staff_team_points_for_run('海岛组',0,'runtime-station','零分结算',$1,$2)`,
        [zeroIslandEvent, newRunId],
      );
      await db.query(
        `select adjust_staff_team_points_for_run('沙漠组',0,'runtime-station','零分结算',$1,$2)`,
        [zeroDesertEvent, newRunId],
      );
      const zeroSettlement = await scalar(
        db,
        `select settle_phase_two_team_clues_for_run('runtime-zero-tie',$1)::text`,
        [newRunId],
      );
      assert.equal(JSON.parse(zeroSettlement).ranking_rule, 'positive_top_score_joint_first');
      assert.deepEqual(
        (await db.query(
          `select details->>'first_place' first_place,
                  details->>'rank' rank,details->>'clue_count' clue_count
           from audit_log where action='phase_two.team_clues_settle'
             and actor='runtime-zero-tie' order by target_id`,
        )).rows,
        [
          { first_place: 'false', rank: null, clue_count: '1' },
          { first_place: 'false', rank: null, clue_count: '1' },
        ],
      );
      assert.equal(
        Number(await scalar(db, `select count(*) from guest_clues`)),
        20,
        '0:0 gives every competitive player exactly one team clue',
      );
      assert.deepEqual(
        JSON.parse(await scalar(db, `select team_score_snapshot::text from game_state where id=1`)),
        { 海岛组: 0, 沙漠组: 0 },
      );
    } finally {
      await db.close();
    }
  },
);
