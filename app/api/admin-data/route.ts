import { requireAdmin } from '@/lib/auth';
import { getAdminDashboardData } from '@/lib/data/admin';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

// Loading this dashboard also reconciles late private Storage uploads and may
// close registration. Keep that safety mutation on a same-origin POST.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    return noStoreJson(await getAdminDashboardData(actor));
  } catch (error) { return apiErrorResponse(error); }
}
