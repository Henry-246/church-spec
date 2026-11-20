// POST /api/jobs/run-scheduled — moves due work into the SMS queue:
//   * scheduled messages whose time has come
//   * recurring reminders whose time slot has arrived (each slot fires once)
// Called every minute by the scheduler worker. Requires the CRON_SECRET header.
// This regular database access also keeps the free Supabase project from pausing.
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
  const db = createAdminClient();

  const scheduled = await db.rpc("enqueue_due_campaigns");
  if (scheduled.error) console.error("enqueue_due_campaigns failed:", scheduled.error);

  const reminders = await db.rpc("run_due_reminders");
  if (reminders.error) console.error("run_due_reminders failed:", reminders.error);

  const ok = !scheduled.error && !reminders.error;
  return Response.json(
    {
      scheduledCampaignsQueued: scheduled.data ?? 0,
      remindersFired: reminders.data ?? 0,
      errors: ok ? undefined : [scheduled.error?.message, reminders.error?.message].filter(Boolean),
    },
    { status: ok ? 200 : 500 },
  );
}
