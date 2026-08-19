import { requireAdmin } from '@/lib/auth';
import { getHostGameToolkitData } from '@/lib/data/host-games';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    await requireAdmin();
    return noStoreJson(await getHostGameToolkitData());
  } catch (error) { return apiErrorResponse(error); }
}
