import { requireGuest } from '@/lib/auth';
import { getPlayerCodeDirectory } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    const guestId = await requireGuest();
    return noStoreJson({ players: await getPlayerCodeDirectory(guestId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
