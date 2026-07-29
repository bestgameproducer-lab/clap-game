import { requireAdmin } from '@/lib/auth';
import { getHostDashboardData } from '@/lib/data/host';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    await requireAdmin();
    return noStoreJson(await getHostDashboardData());
  } catch (error) { return apiErrorResponse(error); }
}
