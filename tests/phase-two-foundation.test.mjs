import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/202607300009_phase_two_team_foundation.sql', import.meta.url), 'utf8');
const preflight = await readFile(new URL('../lib/preflight.ts', import.meta.url), 'utf8');
const adminRoute = await readFile(new URL('../app/api/admin-action/route.ts', import.meta.url), 'utf8');
const adminPage = await readFile(new URL('../app/admin/page.tsx', import.meta.url), 'utf8');

test('final roster separates visible group membership from phase-two eligibility', () => {
  assert.match(migration, /add column if not exists phase_two_eligible boolean not null default false/);
  assert.match(migration, /team='家人组',team_locked=true,phase_two_eligible=false/);
  assert.match(migration, /lower\(login_name\) in \('xingcheng jin','andao chen'\)/);
  assert.match(migration, /where lower\(login_name\)='ziyang jin'/);
  assert.match(migration, /v_family<>10 or v_island<>10 or v_desert<>10/);
  assert.doesNotMatch(migration, /truncate\s|delete from guests/i);
});

test('competitive team capacity is two groups of ten with one trickster each', () => {
  assert.match(preflight, /WEDDING_TEAMS = \['海岛组', '沙漠组'\]/);
  assert.match(preflight, /team\.total <= 10 && team\.spies <= 1 && team\.guests <= 9/);
  assert.match(migration, /'yirui zhang'[\s\S]+'junheng liu'/);
  assert.match(migration, /p_role not in \('guest','spy'\)/);
  assert.doesNotMatch(migration.slice(migration.indexOf('create or replace function configure_guest_game_profile')), /p_role not in \('guest','spy','helper'\)/);
});

test('phase two configuration is private, audited, and server validated', () => {
  assert.match(migration, /alter table phase_two_profiles enable row level security/);
  assert.match(migration, /revoke all on phase_two_profiles,phase_two_dilemmas,phase_two_copy_choices from public,anon,authenticated/);
  assert.match(migration, /'phase_two\.profile_configure'/);
  assert.match(adminRoute, /requiredEnum\(body\.primaryMission, '第二阶段主任务', PHASE_TWO_PRIMARY_MISSIONS\)/);
  assert.match(adminRoute, /requiredBoolean\(body\.extraVote, '额外投票权'\)/);
  assert.match(adminPage, /第二阶段配置/);
  assert.match(adminPage, /双重裁决/);
  assert.match(adminPage, /超级幸运星/);
});

test('phase two mission catalogue is forward-only and fail-closed around unresolved coverage', () => {
  for (const code of [
    'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004','P2-CEREMONY-001',
    'P2-HEART-001','P2-STAR-001','P2-LONELY-001','P2-GUIDE-001','P2-TRICKSTER-001',
  ]) assert.match(migration, new RegExp(code));
  assert.match(migration, /check\(not \(primary_mission='TRICKSTER' and \(extra_vote or super_lucky\)\)\)/);
  assert.match(migration, /check\(not \(primary_mission='COPY_SCORE' and super_lucky\)\)/);
});

