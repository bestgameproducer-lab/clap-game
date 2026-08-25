import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlatformProjectExport } from '../lib/platform/project-export.ts';

test('customer project backup contains the owned configuration and explicit privacy safeguards only', () => {
  const result = buildPlatformProjectExport({
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
    storyNote: 'Private story note',
    contentBrief: {
      language: 'bilingual', interaction: 'balanced', guestMix: 'balanced', storyMoments: 'Private story', avoidTopics: 'Private boundary', boundariesConfirmed: true, hostNotes: 'Private host note',
    },
    templateContent: {
      teamOneName: 'Ocean', teamTwoName: 'Desert', openingScript: 'Welcome', quizQuestions: [], quickQuizQuestions: [], charadesWords: [],
    },
    deliveryScope: {
      customizationLevel: 'guided', supportMode: 'remote_guided', rehearsalMode: 'full_rehearsal', services: ['host-runbook'], serviceNotes: 'Private service note',
    },
    version: 3,
    updatedAt: '2027-04-01T00:00:00.000Z',
    accessRole: 'owner',
  }, '2027-04-02T00:00:00.000Z');

  assert.equal(result.schemaVersion, 'wedding-project-draft/v1');
  assert.equal(result.project.version, 3);
  assert.equal(result.project.experience.contentBrief.storyMoments, 'Private story');
  assert.equal(result.project.commercialIntent.deliveryScope.supportMode, 'remote_guided');
  assert.deepEqual(result.safeguards, {
    containsPrivateCustomerContent: true,
    containsGuestRuntimeData: false,
    containsCollaboratorAccounts: false,
    containsCredentials: false,
    constitutesFinalWeddingArchive: false,
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['sourceDraftId', 'accessRole', 'email', 'invitation', 'audit', 'entitlement', 'runtimeInstance']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
