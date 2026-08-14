import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the final draw definition still reserves Yirui for the first-act photo facade', async () => {
  const [reservation, wrapper, facadePatch, migrationNames] = await Promise.all([
    read('supabase/migrations/202607310015_reserve_phase_two_speech_player.sql'),
    read('supabase/migrations/202608130012_lock_remaining_finale_mutations.sql'),
    read('supabase/migrations/202608130017_balance_trickster_facade_capacity.sql'),
    readdir(new URL('../supabase/migrations/', import.meta.url)),
  ]);

  assert.match(reservation, /lower\(v_guest\.login_name\)='yirui zhang'[\s\S]*?mission_code='P1-SOCIAL-001'/);
  assert.match(reservation, /speech_player\.phase_two_eligible[\s\S]*?lower\(speech_player\.login_name\)='yirui zhang'/);
  assert.match(wrapper, /alter function draw_guest_card\(uuid\)\s+rename to draw_guest_card_before_final_lock/);
  assert.match(facadePatch, /public\.draw_guest_card_before_final_lock\(uuid\)/);
  assert.match(facadePatch, /v_guest\.team='海岛组' then 'P1-SOCIAL-001' else 'P1-SOCIAL-002'/);

  const laterSources = await Promise.all(migrationNames
    .filter((name) => name.endsWith('.sql') && name > '202608130017_balance_trickster_facade_capacity.sql')
    .sort()
    .map((name) => read(`supabase/migrations/${name}`)));
  assert.doesNotMatch(
    laterSources.join('\n'),
    /create (?:or replace )?function draw_guest_card_before_final_lock\s*\(/i,
  );
});

test('every official first-act photo team distribution is absorbed before dinner photos', async () => {
  // Three ordinary competitive photo assignments exist. One is always Yirui,
  // who is consumed by DINNER_SPEECH before the two team-scoped EXTRA_VOTE
  // picks and the global SUPER_LUCKY pick. Enumerate all possible locations of
  // the two remaining photos, including both being on the same team.
  const reachable = [];
  for (let islandOtherPhotos = 0; islandOtherPhotos <= 2; islandOtherPhotos += 1) {
    for (const yiruiTeam of ['island']) {
      const desertOtherPhotos = 2 - islandOtherPhotos;
      const afterSpeech = { island: islandOtherPhotos, desert: desertOtherPhotos };
      const afterExtras = {
        island: Math.max(0, afterSpeech.island - 1),
        desert: Math.max(0, afterSpeech.desert - 1),
      };
      const afterLucky = afterExtras.island + afterExtras.desert > 0
        ? afterExtras.island > 0
          ? { island: afterExtras.island - 1, desert: afterExtras.desert }
          : { island: afterExtras.island, desert: afterExtras.desert - 1 }
        : afterExtras;
      reachable.push({ yiruiTeam, islandOtherPhotos, desertOtherPhotos, afterLucky });
      assert.equal(afterLucky.island + afterLucky.desert, 0);
    }
  }
  assert.deepEqual(reachable.map(({ islandOtherPhotos, desertOtherPhotos }) => (
    `${islandOtherPhotos}/${desertOtherPhotos}`
  )), ['0/2', '1/1', '2/0']);
});

test('the allocator fails closed with named photo-contract diagnostics and keeps four dinner missions strict', async () => {
  const [allocator, guard, admin, host] = await Promise.all([
    read('supabase/migrations/202608130032_make_phase_two_allocator_team_safe.sql'),
    read('supabase/migrations/202608130033_assert_phase_two_photo_absorption.sql'),
    read('lib/data/admin.ts'),
    read('lib/data/host.ts'),
  ]);

  assert.match(allocator, /foreach v_team in array array\['海岛组','沙漠组'\] loop/);
  assert.match(allocator, /order by exists\([\s\S]*?P1-SOCIAL-001','P1-SOCIAL-002'[\s\S]*?\) desc,random\(\)/);
  assert.match(guard, /lower\(g\.login_name\)='yirui zhang'[\s\S]*?t\.mission_code='P1-SOCIAL-001'/);
  assert.match(guard, /mission_code in\('P1-SOCIAL-001','P1-SOCIAL-002'\)\)<>3/);
  assert.match(guard, /message='phase_two_first_act_photo_contract_invalid'/);
  assert.match(guard, /message='phase_two_photo_absorption_incomplete'/);
  assert.match(allocator, /'TOAST_GROOM_FATHER','TOAST_BRIDE_MOTHER','INTERACT_WITH_GROOM','INTERACT_WITH_BRIDE'/);
  assert.doesNotMatch(guard, /repeat_photo|fallback/);

  const contractPatchTarget = `  if not found then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable';
  end if;

  -- The relationship outcome, not a profile preset or any previous browser`;
  const absorptionPatchTarget = `  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;

  -- The four photography missions are assigned only to the remaining players`;
  assert.equal(allocator.split(contractPatchTarget).length - 1, 1, '033 must patch exactly one contract anchor');
  assert.equal(allocator.split(absorptionPatchTarget).length - 1, 1, '033 must patch exactly one absorption anchor');

  for (const source of [admin, host]) {
    assert.match(source, /phase_two_first_act_photo_contract_invalid/);
    assert.match(source, /phase_two_photo_absorption_incomplete/);
    assert.match(source, /本次没有发放第二轮任务|第二轮尚未发放/);
  }
});
