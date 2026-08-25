import { FLAGSHIP_TEMPLATE } from './catalog';
import { createPlatformDraftId, ensureWeddingDraftId, isWeddingDraft, type WeddingDraft } from './draft';
import { LEGACY_PLATFORM_PROJECT_EXPORT_SCHEMA, PLATFORM_PROJECT_EXPORT_SCHEMA } from './project-export';

export const PLATFORM_PROJECT_BACKUP_MAX_BYTES = 512 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function restorePlatformProjectBackup(value: unknown): WeddingDraft | null {
  if (!isObject(value) || !hasExactKeys(value, ['schemaVersion', 'exportedAt', 'project', 'safeguards'])) return null;
  if (
    value.schemaVersion !== PLATFORM_PROJECT_EXPORT_SCHEMA
    && value.schemaVersion !== LEGACY_PLATFORM_PROJECT_EXPORT_SCHEMA
  ) return null;
  if (typeof value.exportedAt !== 'string') return null;
  if (!isObject(value.project) || !hasExactKeys(value.project, [
    'id', 'version', 'status', 'template', 'wedding', 'experience', 'commercialIntent', 'customerNotes',
  ])) return null;
  if (!isObject(value.safeguards) || !hasExactKeys(value.safeguards, [
    'containsPrivateCustomerContent', 'containsGuestRuntimeData', 'containsCollaboratorAccounts',
    'containsCredentials', 'constitutesFinalWeddingArchive',
  ])) return null;
  if (
    value.safeguards.containsPrivateCustomerContent !== true
    || value.safeguards.containsGuestRuntimeData !== false
    || value.safeguards.containsCollaboratorAccounts !== false
    || value.safeguards.containsCredentials !== false
    || value.safeguards.constitutesFinalWeddingArchive !== false
  ) return null;

  const project = value.project;
  if (!isObject(project.template) || !hasExactKeys(project.template, ['id', 'version'])) return null;
  if (project.template.id !== FLAGSHIP_TEMPLATE.id || project.template.version !== FLAGSHIP_TEMPLATE.version) return null;
  if (!isObject(project.wedding) || !hasExactKeys(project.wedding, ['partnerOne', 'partnerTwo', 'date', 'location', 'guestCapacity'])) return null;
  if (!isObject(project.experience) || !hasExactKeys(project.experience, ['theme', 'tone', 'modules', 'contentBrief', 'templateContent'])) return null;
  const isLegacy = value.schemaVersion === LEGACY_PLATFORM_PROJECT_EXPORT_SCHEMA;
  if (!isObject(project.commercialIntent) || !hasExactKeys(
    project.commercialIntent,
    isLegacy ? ['plan', 'deliveryScope'] : ['plan', 'deliveryScope', 'dataPolicy'],
  )) return null;
  if (!isObject(project.customerNotes) || !hasExactKeys(project.customerNotes, ['storyNote'])) return null;

  const candidate: WeddingDraft = {
    draftId: createPlatformDraftId(),
    partnerOne: project.wedding.partnerOne as string,
    partnerTwo: project.wedding.partnerTwo as string,
    weddingDate: project.wedding.date as string,
    location: project.wedding.location as string,
    guestCount: String(project.wedding.guestCapacity) as WeddingDraft['guestCount'],
    theme: project.experience.theme as WeddingDraft['theme'],
    tone: project.experience.tone as WeddingDraft['tone'],
    modules: project.experience.modules as WeddingDraft['modules'],
    plan: project.commercialIntent.plan as WeddingDraft['plan'],
    storyNote: project.customerNotes.storyNote as string,
    contentBrief: project.experience.contentBrief as WeddingDraft['contentBrief'],
    templateContent: project.experience.templateContent as WeddingDraft['templateContent'],
    deliveryScope: project.commercialIntent.deliveryScope as WeddingDraft['deliveryScope'],
    dataPolicy: isLegacy ? undefined : project.commercialIntent.dataPolicy as WeddingDraft['dataPolicy'],
  };
  return isWeddingDraft(candidate) ? ensureWeddingDraftId(candidate) : null;
}
