// POST /api/jobs/process-queue — sends ONE batch of queued SMS.
// Called every minute (repeatedly) by the scheduler worker. Requires
//   Authorization: Bearer <CRON_SECRET>
// Response: { claimed, sent, failed, retrying, more }. "more": true means
// another call is likely to find more messages waiting.
import { checkCronAuth } from "@/lib/jobs-auth";
import { processQueueBatch } from "@/lib/sms/queue";

export async function POST(request: Request) {
  const denied = checkCronAuth(request);
  if (denied) return denied;
  try {
    return Response.json(await processQueueBatch());
  } catch (err) {
    console.error("process-queue failed:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
