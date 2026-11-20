// POST /api/jobs/birthdays — queues today's birthday SMS.
// Safe to call many times a day: the database only sends after the birthday
// send time set in Settings (and before 21:00), and at most once per member per
// year (birthday_log). Requires the CRON_SECRET header.
import { checkCronAuth } from "@/lib/jobs-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const denied = checkCronAuth(request);
  if (denied) return denied;
  try {
    return await run();
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function run(): Promise<Response> {
  const { data, error } = await createAdminClient().rpc("run_birthdays");
  if (error) {
    console.error("run_birthdays failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ birthdaysQueued: data ?? 0 });
}
