// Supabase client with the SERVICE-ROLE key: full database access, bypasses
// Row Level Security. SERVER ONLY. Use it only for:
//   * the public registration form (visitors are not logged in),
//   * the SMS queue and scheduled jobs,
//   * managing admin users (Supabase Auth admin API),
// and only AFTER checking the caller is allowed to do the action.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

export function createAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
