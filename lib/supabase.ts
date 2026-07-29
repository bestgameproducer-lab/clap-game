import { createClient } from '@supabase/supabase-js';
import 'server-only';
import { getServerEnv } from './env';

export function getSupabaseAdmin() {
  const env = getServerEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
