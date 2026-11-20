// Integration test: the real queue code (lib/sms/queue.ts + lib/sms/nalo.ts)
// against the real database functions (supabase/migrations, run in PGlite),
// with a fake Nalo server. Checks that the TypeScript and SQL agree on
// function names, argument names and result shapes.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

const env: Record<string, string> = {
  SMS_DRY_RUN: "false",
  NALO_API_KEY: "test-key",
  NALO_SENDER_ID: "MYCHURCH",
  NALO_API_URL: "https://nalo.test/send-message/",
  QUEUE_BATCH_SIZE: "20",
};
vi.mock("@/lib/env", () => ({
  getEnv: (n: string) => env[n],
  requireEnv: (n: string) => {
    if (!env[n]) throw new Error(`Missing ${n}`);
    return env[n];
  },
  isSmsDryRun: () => env.SMS_DRY_RUN?.toLowerCase() !== "false",
}));

const db = new PGlite();

// Minimal stand-in for the parts of supabase-js the queue code uses.
const SETOF_FUNCTIONS = new Set(["claim_sms_batch"]);
function fakeSupabase() {
  return {
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      const keys = Object.keys(args);
      const params = keys.map((k) => {
        const v = args[k];
        return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : Array.isArray(v) && fn !== "retry_failed_sms" ? JSON.stringify(v) : v;
      });
      const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      try {
        if (SETOF_FUNCTIONS.has(fn)) return { data: (await db.query(`select * from ${call}`, params)).rows, error: null };
        const rows = (await db.query<{ r: unknown }>(`select ${call} as r`, params)).rows;
        return { data: rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          return {
            select: () => ({
              async single() {
                const cols = Object.keys(row);
                const vals = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
                try {
                  const r = await db.query(`insert into public.${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals);
                  return { data: r.rows[0], error: null };
                } catch (e) {
                  return { data: null, error: { message: (e as Error).message } };
                }
              },
            }),
          };
        },
      };
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeSupabase() }));

// Fake Nalo: records requests; replies based on the phone number.
const naloRequests: { url: string; body: Record<string, string> }[] = [];
function installFakeNalo() {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    naloRequests.push({ url, body });
    if (body.msisdn.endsWith("0001")) return new Response('{"status":"1706"}', { status: 200 }); // invalid number
    if (body.msisdn.endsWith("0002")) throw new TypeError("network down"); // retryable
    return new Response(JSON.stringify({ status: "1701", job_id: `api.${naloRequests.length}`, msisdn: body.msisdn }), { status: 200 });
  });
}

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  const dir = path.resolve(import.meta.dirname, "../supabase/migrations");
  for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  naloRequests.length = 0;
});

describe("queue + Nalo integration", () => {
  it("registration via rpc (same call as the /join action) queues a welcome SMS that gets sent", async () => {
    installFakeNalo();
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { processQueueBatch } = await import("@/lib/sms/queue");

    const { data, error } = await createAdminClient().rpc("register_member", {
      p: { full_name: "Ama Owusu", phone: "233241110000", status: "member", group_ids: [], sms_consent: true, source: "banner" },
    });
    expect(error).toBeNull();
    expect((data as { is_new: boolean }).is_new).toBe(true);

    const r = await processQueueBatch();
    expect(r).toMatchObject({ claimed: 1, sent: 1, failed: 0, more: false });
    expect(naloRequests).toHaveLength(1);
    expect(naloRequests[0].url).toBe("https://nalo.test/send-message/");
    expect(naloRequests[0].body).toEqual({
      key: "test-key",
      msisdn: "233241110000",
      message: "Welcome to Our Church, Ama! We are glad you joined us. God bless you.",
      sender_id: "MYCHURCH",
    });
    const row = (await db.query<{ status: string; provider_message_id: string; provider_response: string }>("select * from outbound_sms")).rows[0];
    expect(row.status).toBe("sent");
    expect(row.provider_message_id).toBe("api.1");
    expect(row.provider_response).toContain("1701");
  });

  it("campaign to everyone: batches, failures with readable reasons, retry", async () => {
    installFakeNalo();
    const { createCampaign, processQueueBatch, countAudience } = await import("@/lib/sms/queue");
    await db.exec(`insert into members (full_name, phone, status, sms_consent)
      select 'Person ' || g, '23350' || lpad(g::text, 7, '0'), 'member', true from generate_series(1, 44) g;`);
    // 44 + Ama = 45 members; phones ...0001 (invalid) and ...0002 (network error) are special.
    expect(await countAudience({ type: "all" })).toBe(45);

    const c = await createCampaign({ type: "manual", body: "Hi {first_name}, service at 8am", audience: { type: "all" } });
    expect(c).toMatchObject({ recipients: 45, scheduled: false });

    const b1 = await processQueueBatch();
    expect(b1.claimed).toBe(20);
    expect(b1.more).toBe(true);
    await processQueueBatch();
    const b3 = await processQueueBatch();
    expect(b3.claimed).toBe(5);
    expect(b3.more).toBe(false);

    const campaign = (await db.query<{ sent_count: number; failed_count: number; status: string }>("select * from campaigns where id = $1", [c.id])).rows[0];
    expect(campaign.sent_count).toBe(43);
    expect(campaign.failed_count).toBe(1); // invalid number fails immediately
    expect(campaign.status).toBe("sending"); // network-error one is waiting to retry

    const failed = (await db.query<{ error: string }>("select error from outbound_sms where status='failed'")).rows[0];
    expect(failed.error).toMatch(/Invalid destination phone number/);
    const retry = (await db.query<{ status: string; error: string }>("select status, error from outbound_sms where phone like '%0002' and campaign_id = $1", [c.id])).rows[0];
    expect(retry.status).toBe("pending");
    expect(retry.error).toMatch(/Could not reach Nalo/);

    // Personalised bodies
    const one = (await db.query<{ body: string }>("select body from outbound_sms where phone = '233500000007'")).rows[0];
    expect(one.body).toBe("Hi Person, service at 8am");

    // Admin retries the failed one (same rpc call as the History page).
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data: n, error } = await createAdminClient().rpc("retry_failed_sms", { p_campaign_id: c.id, p_sms_ids: null });
    expect(error).toBeNull();
    expect(n).toBe(1);
  });

  it("scheduled campaigns wait for the scheduler", async () => {
    const { createCampaign, processQueueBatch } = await import("@/lib/sms/queue");
    const c = await createCampaign({ type: "manual", body: "Later", audience: { type: "status", statuses: ["member"] }, scheduledFor: new Date(Date.now() + 3600_000) });
    expect(c.scheduled).toBe(true);
    expect(c.recipients).toBe(45);
    const queued = (await db.query<{ n: number }>("select count(*)::int n from outbound_sms where campaign_id = $1", [c.id])).rows[0].n;
    expect(queued).toBe(0);
    await db.query("update outbound_sms set status='cancelled' where status='pending'"); // clear leftovers
    expect((await processQueueBatch()).claimed).toBe(0);
  });

  it("dry-run mode never calls Nalo", async () => {
    env.SMS_DRY_RUN = "true";
    installFakeNalo();
    const { createCampaign, processQueueBatch } = await import("@/lib/sms/queue");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await createCampaign({ type: "test", body: "Test {first_name}", audience: { type: "phone", phone: "233209999999" } });
    const r = await processQueueBatch();
    expect(r).toMatchObject({ claimed: 1, sent: 1 });
    expect(naloRequests).toHaveLength(0);
    const row = (await db.query<{ status: string; provider_response: string }>("select * from outbound_sms where phone = '233209999999'")).rows[0];
    expect(row.status).toBe("sent");
    expect(row.provider_response).toContain("DRY_RUN");
    log.mockRestore();
    env.SMS_DRY_RUN = "false";
  });

  it("uses username/password when no API key is set", async () => {
    installFakeNalo();
    const { sendSms } = await import("@/lib/sms/nalo");
    const savedKey = env.NALO_API_KEY;
    delete env.NALO_API_KEY;
    env.NALO_USERNAME = "church";
    env.NALO_PASSWORD = "secret@123";
    const r = await sendSms({ to: "233241119999", message: "Hello" });
    expect(r.ok).toBe(true);
    expect(naloRequests[0].body).toEqual({ username: "church", password: "secret@123", msisdn: "233241119999", message: "Hello", sender_id: "MYCHURCH" });
    env.NALO_API_KEY = savedKey;
    delete env.NALO_USERNAME;
    delete env.NALO_PASSWORD;
  });

  it("missing Nalo settings fail clearly and are NOT retried", async () => {
    installFakeNalo();
    const { sendSms } = await import("@/lib/sms/nalo");
    const savedKey = env.NALO_API_KEY;
    delete env.NALO_API_KEY;
    const r = await sendSms({ to: "233241119999", message: "Hello" });
    expect(r).toMatchObject({ ok: false, retryable: false });
    expect(r.error).toMatch(/not set up/);
    expect(naloRequests).toHaveLength(0);
    env.NALO_API_KEY = savedKey;
  });
});
