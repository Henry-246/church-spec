// Scheduler worker: a tiny Cloudflare Worker whose only job is to "ping" the
// main app's job endpoints on a timer (Cron Trigger, every minute).
//
// Every minute it:
//   1. POST /api/jobs/run-scheduled   → queue due scheduled messages + reminders
//   2. POST /api/jobs/birthdays       → every 5 minutes (the database decides
//                                       whether it is birthday-sending time)
//   3. POST /api/jobs/process-queue   → repeatedly, until the queue is empty or
//                                       MAX_QUEUE_CALLS is reached
//
// Each call to the app is a separate request, so each gets its own Cloudflare
// limits (50 outgoing requests on the free plan): that is how large sends stay
// within the free plan.
//
// In production the app is reached through a Service Binding called APP (a
// direct Worker-to-Worker connection). For local testing, if APP_URL points to
// localhost, a normal HTTP request is used instead.

// Minimal type definitions (avoids an extra dependency).
interface Fetcher {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
interface ScheduledController {
  scheduledTime: number;
  cron: string;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  APP?: Fetcher; // service binding to the main app worker
  APP_URL: string; // e.g. https://church-sms.example.workers.dev
  CRON_SECRET: string; // same value as the main app's CRON_SECRET
  MAX_QUEUE_CALLS?: string; // default 10 (≈ 200 SMS per minute with batches of 20)
}

type JobResult = { path: string; status: number; body: unknown };

async function callJob(env: Env, path: string): Promise<JobResult> {
  const url = new URL(path, env.APP_URL);
  const init: RequestInit = {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  };
  const useHttp = !env.APP || ["localhost", "127.0.0.1"].includes(url.hostname);
  try {
    const res = useHttp ? await fetch(url, init) : await env.APP!.fetch(url.toString(), init);
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }
    if (!res.ok) console.error(`${path} → HTTP ${res.status}`, text.slice(0, 500));
    return { path, status: res.status, body };
  } catch (err) {
    console.error(`${path} failed:`, err);
    return { path, status: 0, body: String(err) };
  }
}

export async function runOnce(env: Env, now = new Date()): Promise<JobResult[]> {
  if (!env.APP_URL || !env.CRON_SECRET) {
    console.error("APP_URL and CRON_SECRET must be set for the scheduler worker.");
    return [];
  }
  const results: JobResult[] = [];

  results.push(await callJob(env, "/api/jobs/run-scheduled"));

  if (now.getUTCMinutes() % 5 === 0) {
    results.push(await callJob(env, "/api/jobs/birthdays"));
  }

  const maxCalls = Math.max(1, Math.min(40, Number(env.MAX_QUEUE_CALLS ?? 10) || 10));
  for (let i = 0; i < maxCalls; i++) {
    const r = await callJob(env, "/api/jobs/process-queue");
    results.push(r);
    const more = r.status === 200 && (r.body as { more?: boolean } | null)?.more === true;
    if (!more) break;
  }

  console.log(JSON.stringify(results.map((r) => ({ path: r.path, status: r.status, body: r.body }))));
  return results;
}

const worker = {
  // Cron Trigger (see wrangler.jsonc "triggers").
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runOnce(env, new Date(controller.scheduledTime)));
  },

  // Manual run for testing: POST https://<scheduler>/run with the CRON_SECRET header.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/run" && request.method === "POST") {
      if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      return Response.json(await runOnce(env));
    }
    return new Response("Church SMS scheduler. Nothing to see here.", { status: 404 });
  },
};

export default worker;
