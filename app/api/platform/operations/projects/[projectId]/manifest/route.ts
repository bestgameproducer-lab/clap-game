import { getPlatformProvisioningManifest, lockPlatformProvisioningManifest } from '@/lib/data/platform-operations';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformStaff } from '@/lib/platform/staff';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformManifestLockInput } from '@/lib/validation/platform-operations';

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const staff = await requirePlatformStaff();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const record = await getPlatformProvisioningManifest(staff.user.id, projectId);
    return new Response(JSON.stringify(record.manifest, null, 2), {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="wedding-instance-${projectId}-v${record.project_version}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const staff = await requirePlatformStaff();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformManifestLockInput(await readJsonObject(request));
    return noStoreJson({ manifest: await lockPlatformProvisioningManifest(staff.user.id, projectId, input.eventKey) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
