import { requireGuest } from '@/lib/auth';
import { getGuestView } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';

export async function GET() {
  try {
    const guestId = await requireGuest();
    return noStoreJson(await getGuestView(guestId));
  } catch (error) { return apiErrorResponse(error); }
}
