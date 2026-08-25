import type { PlatformProjectDto } from '../data/platform-projects';

export const PLATFORM_PROJECT_EXPORT_SCHEMA = 'wedding-project-draft/v2' as const;
export const LEGACY_PLATFORM_PROJECT_EXPORT_SCHEMA = 'wedding-project-draft/v1' as const;

export function buildPlatformProjectExport(project: PlatformProjectDto, exportedAt: string) {
  return {
    schemaVersion: PLATFORM_PROJECT_EXPORT_SCHEMA,
    exportedAt,
    project: {
      id: project.id,
      version: project.version,
      status: project.status,
      template: { id: project.templateId, version: project.templateVersion },
      wedding: {
        partnerOne: project.partnerOne,
        partnerTwo: project.partnerTwo,
        date: project.weddingDate,
        location: project.location,
        guestCapacity: project.guestCount,
      },
      experience: {
        theme: project.themeId,
        tone: project.toneId,
        modules: [...project.modules],
        contentBrief: project.contentBrief,
        templateContent: project.templateContent,
      },
      commercialIntent: {
        plan: project.planId,
        deliveryScope: project.deliveryScope,
        dataPolicy: project.dataPolicy,
      },
      customerNotes: { storyNote: project.storyNote },
    },
    safeguards: {
      containsPrivateCustomerContent: true,
      containsGuestRuntimeData: false,
      containsCollaboratorAccounts: false,
      containsCredentials: false,
      constitutesFinalWeddingArchive: false,
    },
  };
}
