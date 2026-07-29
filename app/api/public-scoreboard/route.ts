import { getPublicScoreboard } from '@/lib/data/public';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    return noStoreJson(await getPublicScoreboard());
  } catch (error) { return apiErrorResponse(error); }
}
