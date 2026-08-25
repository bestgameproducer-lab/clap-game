import { requirePlatformUser } from '@/lib/platform/auth';
import { listPlatformProjects, savePlatformProject } from '@/lib/data/platform-projects';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject } from '@/lib/validation';
import { readPlatformProjectSaveInput } from '@/lib/validation/platform-project';

export async function GET() {
  try {
    const user = await requirePlatformUser();
    return noStoreJson({ projects: await listPlatformProjects(user.id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requirePlatformUser();
    const input = readPlatformProjectSaveInput(await readJsonObject(request));
    return noStoreJson({ project: await savePlatformProject(user.id, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
