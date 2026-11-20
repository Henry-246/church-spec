// Reads the single settings row (church name, templates, …).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";

export const DEFAULT_CHURCH_NAME = "Our Church";

export async function getSettings(): Promise<Settings> {
  const db = createAdminClient();
  const { data, error } = await db.from("settings").select("*").eq("id", true).maybeSingle<Settings>();
  if (error) throw new Error(`Could not load settings: ${error.message}`);
  if (!data) throw new Error("Settings row is missing. Run supabase/migrations/..._seed.sql.");
  return data;
}
