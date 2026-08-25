import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PLATFORM_DATA_POLICY,
  PLATFORM_RETENTION_WINDOWS,
  getPlatformRetentionDays,
  isPlatformDataPolicy,
  isPlatformDataPolicyReady,
  normalizePlatformDataPolicy,
} from '../lib/platform/data-policy.ts';
import { buildPlatformProjectExport } from '../lib/platform/project-export.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const confirmedPolicy = {
  retentionWindow: 'event_plus_30_days',
  projectArchiveBeforeDeletion: true,
  rosterAuthorityConfirmed: true,
  guestNoticeConfirmed: true,
  isolatedRuntimeRequired: true,
};

function projectDto() {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    sourceDraftId: '20000000-0000-4000-8000-000000000001',
    status: 'draft',
    templateId: 'cupid-wedding-trial',
    templateVersion: '2026.08',
    planId: 'buyout',
    partnerOne: 'Partner One',
    partnerTwo: 'Partner Two',
    weddingDate: '2027-05-20',
    location: 'Bali',
    guestCount: 80,
    themeId: 'estate',
    toneId: 'romantic',
    modules: ['secret-missions', 'finale-vote'],
    storyNote: 'Story',
    contentBrief: { language: 'chinese', interaction: 'balanced', guestMix: 'balanced', storyMoments: 'Story', avoidTopics: '', boundariesConfirmed: true, hostNotes: '' },
    templateContent: { teamOneName: 'Ocean', teamTwoName: 'Desert', openingScript: 'Welcome', quizQuestions: [], quickQuizQuestions: [], charadesWords: [], missionCopyOverrides: [] },
    deliveryScope: { customizationLevel: 'guided', supportMode: 'remote_guided', rehearsalMode: 'full_rehearsal', services: ['host-runbook'], serviceNotes: '' },
    dataPolicy: confirmedPolicy,
    version: 2,
    updatedAt: '2027-04-01T00:00:00.000Z',
    accessRole: 'owner',
  };
}

test('data policy is closed-shape, finite, isolated, and requires both confirmations', () => {
  assert.equal(PLATFORM_RETENTION_WINDOWS.length, 3);
  assert.deepEqual(PLATFORM_RETENTION_WINDOWS.map((option) => option.days), [7, 30, 90]);
  assert.equal(isPlatformDataPolicy(DEFAULT_PLATFORM_DATA_POLICY), true);
  assert.equal(isPlatformDataPolicyReady(DEFAULT_PLATFORM_DATA_POLICY), false);
  assert.equal(isPlatformDataPolicy(confirmedPolicy), true);
  assert.equal(isPlatformDataPolicyReady(confirmedPolicy), true);
  assert.equal(getPlatformRetentionDays(confirmedPolicy), 30);
  assert.equal(isPlatformDataPolicy({ ...confirmedPolicy, retentionWindow: 'forever' }), false);
  assert.equal(isPlatformDataPolicy({ ...confirmedPolicy, isolatedRuntimeRequired: false }), false);
  assert.equal(isPlatformDataPolicy({ ...confirmedPolicy, hiddenRole: 'trickster' }), false);
});

test('invalid or absent policy normalizes to the conservative seven-day unconfirmed default', () => {
  assert.deepEqual(normalizePlatformDataPolicy(undefined), DEFAULT_PLATFORM_DATA_POLICY);
  assert.deepEqual(normalizePlatformDataPolicy({ retentionWindow: 'forever' }), DEFAULT_PLATFORM_DATA_POLICY);
  const normalized = normalizePlatformDataPolicy(confirmedPolicy);
  assert.notEqual(normalized, confirmedPolicy);
  assert.deepEqual(normalized, confirmedPolicy);
});

test('v2 project backups preserve data policy while the importer explicitly supports legacy v1 defaults', () => {
  const current = buildPlatformProjectExport(projectDto(), '2027-04-02T00:00:00.000Z');
  assert.equal(current.schemaVersion, 'wedding-project-draft/v2');
  assert.equal(current.project.commercialIntent.dataPolicy.retentionWindow, 'event_plus_30_days');
  assert.equal(current.project.commercialIntent.dataPolicy.rosterAuthorityConfirmed, true);

  const importer = fs.readFileSync(path.join(rootDir, 'lib/platform/project-backup.ts'), 'utf8');
  assert.match(importer, /LEGACY_PLATFORM_PROJECT_EXPORT_SCHEMA/);
  assert.match(importer, /isLegacy \? \['plan', 'deliveryScope'\] : \['plan', 'deliveryScope', 'dataPolicy'\]/);
  assert.match(importer, /dataPolicy: isLegacy \? undefined/);
  assert.match(importer, /isWeddingDraft\(candidate\)/);
});
