import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202607290041_final_roster_participation.sql', import.meta.url);

test('all 32 final guests remain app-login eligible while runtime rehearsal data is cleared', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /insert into final_wedding_roster_v1 values/);
  assert.equal((migration.match(/^\('/gm) ?? []).length, 32);
  assert.match(migration, /uses_app=true/);
  assert.match(migration, /where g\.active and g\.uses_app/);
  assert.match(migration, /where active and uses_app and lower/);
  assert.match(migration, /delete from assignments/);
  assert.match(migration, /claim_code_hash=null,claimed_at=null,drawn_at=null/);
});

test('honor guests draw a dedicated family surprise instead of a random task', async () => {
  const [migration, surpriseMigration, dashboardMigration, familyAlignmentMigration, guestPage, guestData, revealRoute, publicData] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(new URL('../supabase/migrations/202607290042_honor_surprise_copy.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202607290043_honor_guest_dashboard.sql', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/202607310031_align_added_family_score_eligibility.sql', import.meta.url), 'utf8'),
    readFile(new URL('../app/guest/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/guest.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/reveal-special-card/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/data/public.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /'HONOR_GUEST'/);
  assert.match(migration, /'PRINCIPAL'/);
  assert.match(surpriseMigration, /你已经完成了最重要的任务：一路陪伴新郎长大/);
  assert.match(migration, /guest_not_mission_eligible/);
  assert.match(guestPage, /data\.guest\.participation_mode === 'HONOR_GUEST'/);
  assert.match(guestPage, /data\.guest\.special_card_title/);
  assert.match(guestPage, /revealSpecialCard/);
  assert.match(guestPage, /抽取我的惊喜卡/);
  assert.match(guestPage, /specialCardRevealed \? 'revealed'/);
  assert.match(guestPage, /我已读完 · 进入游戏主页/);
  assert.match(guestPage, /participation_mode === 'ACTIVE_PLAYER' && \(!data\.guest\.drawn_at \|\| revealedCard\)/);
  assert.match(guestPage, /isHonorGuest && <section className="section-card honor-participation-card"/);
  assert.match(guestPage, /isActivePlayer && [^\n]*<section className=\{`section-card .*`} id="guest-missions"/);
  assert.match(guestPage, /usesTricksterFacade && secretReaderOpen \? 'TRUE MISSIONS' : 'SECRET MISSIONS'/);
  assert.match(dashboardMigration, /add column if not exists special_card_revealed_at timestamptz/);
  assert.match(dashboardMigration, /set eligible_for_personal_score=true\s+where active and participation_mode='HONOR_GUEST'/);
  assert.match(dashboardMigration, /guest\.honor_card_revealed/);
  assert.match(dashboardMigration, /old\.claimed_at is not null and new\.claimed_at is null/);
  assert.match(dashboardMigration, /guest_clues_guest_eligibility_guard/);
  assert.match(dashboardMigration, /votes_participant_eligibility_guard/);
  assert.match(dashboardMigration, /participation_mode='ACTIVE_PLAYER' and drawn_at is not null/);
  assert.match(familyAlignmentMigration, /lower\(login_name\) in \('huimin xu','gang yao'\)/);
  assert.match(familyAlignmentMigration, /team='家人组'/);
  assert.match(familyAlignmentMigration, /participation_mode='HONOR_GUEST'/);
  assert.match(familyAlignmentMigration, /set eligible_for_personal_score=true/);
  assert.match(familyAlignmentMigration, /added_honor_family_roster_mismatch/);
  assert.doesNotMatch(familyAlignmentMigration, /delete from|truncate|eligible_for_mission=true|eligible_for_secret_role=true/);
  assert.match(revealRoute, /assertSameOrigin\(request\)/);
  assert.match(revealRoute, /await requireGuestContext\(\)/);
  assert.match(guestData, /reveal_honor_special_card/);
  assert.match(publicData, /eq\('active', true\)\.eq\('eligible_for_personal_score', true\)/);
  assert.match(publicData, /filter\(hasJoinedPersonalRanking\)/);
  assert.match(publicData, /team: guest\.team/);
  assert.match(publicData, /countsForTeam: guest\.participation_mode === 'ACTIVE_PLAYER' && \['海岛组', '沙漠组'\]\.includes\(guest\.team\)/);
  assert.match(guestData, /participation_mode !== 'ACTIVE_PLAYER'/);
});

test('fixed ceremony players draw their assigned story task and never enter the trickster pool', async () => {
  const migration = await readFile(migrationUrl, 'utf8');
  assert.match(migration, /'OFFICIANT'/);
  assert.match(migration, /'RING_KEEPER'/);
  assert.match(migration, /if not v_guest\.eligible_for_secret_role then\s+v_role:='guest'/);
  assert.match(migration, /where active and story_role_scope=v_guest\.story_role/);
  assert.match(migration, /assignments_guest_eligibility_guard/);
  assert.match(migration, /story_task_guest_mismatch/);
  assert.match(migration, /points_ledger_guest_eligibility_guard/);
  assert.match(migration, /'Andao Chen'.*'RING_KEEPER'/);
  assert.match(migration, /'Yifan Yu'.*'OFFICIANT'/);
  assert.match(migration, /'Xingcheng Jin'.*'RING_KEEPER'/);
});
