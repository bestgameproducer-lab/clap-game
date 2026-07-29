import { createClient } from '@supabase/supabase-js';
import 'server-only';
import { getSupabaseEnv } from './env';

export function getSupabaseAdmin() {
  const env = getSupabaseEnv();
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
