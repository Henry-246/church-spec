// The SMS send queue (see "Sending architecture" in CHURCH_SMS_SPEC.md).
//
// Messages are never sent directly. Instead:
//   1. createCampaign() stores the message and calls the database function
//      enqueue_campaign, which creates one personalised `outbound_sms` row per
//      recipient (status "pending").
//   2. processQueueBatch() takes a small batch of pending rows (claim_sms_batch),
//      sends each through Nalo, then records all results in ONE call
//      (complete_sms_batch).
//
// Why small batches? A Cloudflare Worker on the free plan may only make 50
// outgoing requests per run. One batch = 1 (claim) + N (Nalo) + 1 (complete),
// so N must stay well below 50. The scheduler worker calls the queue endpoint
// again and again until everything is sent.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { sendSms } from "./nalo";
import type { Audience, CampaignType, OutboundSms } from "@/lib/types";

const MAX_BATCH = 40;

/** How many SMS one queue run sends (env QUEUE_BATCH_SIZE, default 20, max 40). */
export function queueBatchSize(): number {
  const n = Number(getEnv("QUEUE_BATCH_SIZE") ?? 20);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_BATCH) : 20;
}

/** Nalo calls running at the same time (Workers allow 6 open connections per request). */
const CONCURRENCY = 4;

export type BatchResult = { claimed: number; sent: number; failed: number; retrying: number; more: boolean };

export async function processQueueBatch(limit = queueBatchSize()): Promise<BatchResult> {
  const db = createAdminClient();

  const { data, error } = await db.rpc("claim_sms_batch", { p_limit: limit });
  if (error) throw new Error(`claim_sms_batch failed: ${error.message}`);
  const rows = (data ?? []) as OutboundSms[];
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0, retrying: 0, more: false };

  const results: {
    id: string;
    ok: boolean;
    retryable: boolean;
    provider_message_id: string | null;
    provider_response: string;
    error: string | null;
  }[] = [];

  // Send with limited parallelism.
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try {
        const r = await sendSms({ to: row.phone, message: row.body });
        results.push({
          id: row.id,
          ok: r.ok,
          retryable: r.retryable,
          provider_message_id: r.providerMessageId ?? null,
          provider_response: r.raw,
          error: r.error ?? null,
        });
      } catch (err) {
        // Unexpected bug: record it rather than leaving the row stuck in "sending".
        const message = err instanceof Error ? err.message : String(err);
        results.push({ id: row.id, ok: false, retryable: false, provider_message_id: null, provider_response: `ERROR: ${message}`, error: `Unexpected error: ${message}` });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  const { error: completeError } = await db.rpc("complete_sms_batch", { p_results: results });
  if (completeError) throw new Error(`complete_sms_batch failed: ${completeError.message}`);

  const sent = results.filter((r) => r.ok).length;
  const retrying = results.filter((r) => !r.ok && r.retryable).length;
  return {
    claimed: rows.length,
    sent,
    failed: rows.length - sent - retrying,
    retrying,
    // A full batch probably means more are waiting.
    more: rows.length >= limit,
  };
}

/**
 * Creates a campaign. If scheduledFor is in the future it waits (status
 * "scheduled") for the scheduler; otherwise it is queued immediately.
 * Returns the campaign id and number of recipients queued.
 */
export async function createCampaign(input: {
  type: CampaignType;
  body: string;
  audience: Audience;
  createdBy?: string | null;
  scheduledFor?: Date | null;
}): Promise<{ id: string; recipients: number; scheduled: boolean }> {
  const db = createAdminClient();
  const scheduled = !!input.scheduledFor && input.scheduledFor.getTime() > Date.now();

  const { data, error } = await db
    .from("campaigns")
    .insert({
      type: input.type,
      body: input.body,
      audience: input.audience,
      created_by: input.createdBy ?? null,
      scheduled_for: input.scheduledFor?.toISOString() ?? null,
      status: scheduled ? "scheduled" : "queued",
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`Could not save the message: ${error.message}`);

  if (scheduled) {
    const { data: count } = await db.rpc("count_audience", { p_audience: input.audience });
    return { id: data.id, recipients: Number(count ?? 0), scheduled: true };
  }

  const { data: count, error: enqueueError } = await db.rpc("enqueue_campaign", { p_campaign_id: data.id });
  if (enqueueError) throw new Error(`Could not queue the message: ${enqueueError.message}`);
  return { id: data.id, recipients: Number(count ?? 0), scheduled: false };
}

/** Number of members an audience currently reaches (consented, not opted out). */
export async function countAudience(audience: Audience): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("count_audience", { p_audience: audience });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/**
 * Sends the first batch straight away, after the response has been sent to
 * the browser, so small sends (e.g. a welcome SMS) go out within seconds
 * instead of waiting for the next scheduler run.
 */
export async function kickQueue(): Promise<void> {
  try {
    await processQueueBatch();
  } catch (err) {
    console.error("Queue kick failed (the scheduler will retry):", err);
  }
}
