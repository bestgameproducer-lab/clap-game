import { requireAdmin } from '@/lib/auth';
import { getAdminDashboardData } from '@/lib/data/admin';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    await requireAdmin();
    return noStoreJson(await getAdminDashboardData());
  } catch (error) { return apiErrorResponse(error); }
}
