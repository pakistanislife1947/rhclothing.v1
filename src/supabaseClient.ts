// ============================================================
// supabaseClient.ts — Singleton Supabase client
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-side only

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    '[SupabaseClient] Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY',
  );
}

/**
 * Service-role client — bypasses RLS.
 * Never expose this key to the browser.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,    // stateless server environment
      autoRefreshToken: false,
    },
  },
);
