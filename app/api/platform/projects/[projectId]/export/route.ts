import { requirePlatformUser } from '@/lib/platform/auth';
import { exportPlatformProjectDraft } from '@/lib/data/platform-projects';
import { apiErrorResponse } from '@/lib/errors';
import { requiredUuid } from '@/lib/validation';

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const project = await exportPlatformProjectDraft(user.id, projectId);
    return new Response(JSON.stringify(project, null, 2), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="wedding-project-${projectId}-v${project.project.version}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
