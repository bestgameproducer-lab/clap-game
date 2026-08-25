import { createPlatformServerClient } from '@/lib/platform/supabase-server';
import { requirePlatformUser } from '@/lib/platform/auth';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requirePlatformUser();
    const client = await createPlatformServerClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw new Error(`Unable to sign out platform user: ${error.message}`);
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
