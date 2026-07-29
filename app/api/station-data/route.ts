import { requireAdmin } from '@/lib/auth';
import { getStationData } from '@/lib/data/station';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    await requireAdmin();
    return noStoreJson(await getStationData());
  } catch (error) { return apiErrorResponse(error); }
}
