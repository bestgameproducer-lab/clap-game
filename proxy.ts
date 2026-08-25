import type { NextRequest } from 'next/server';
import { refreshPlatformSession } from '@/lib/platform/proxy';

export async function proxy(request: NextRequest) {
  return refreshPlatformSession(request);
}

export const config = {
  matcher: [
    '/platform/account/:path*',
    '/platform/projects/:path*',
    '/platform/auth/:path*',
    '/api/platform/:path*',
  ],
};
