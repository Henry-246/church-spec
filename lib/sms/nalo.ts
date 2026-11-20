// THE ONLY FILE THAT TALKS TO NALO SOLUTIONS.
//
// Uses Nalo's JSON API (Postman docs: "Send sms api with auth_key - Json" and
// "Send sms api - Json"):
//   POST https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/
//   {"key": "...", "msisdn": "233XXXXXXXXX", "message": "...", "sender_id": "MYCHURCH"}
// or, with username/password instead of a key:
//   {"username": "...", "password": "...", "msisdn": ..., "message": ..., "sender_id": ...}
// Credentials go in the request BODY (not the URL) so they never appear in logs.
//
// Nalo's docs do not list a balance-check endpoint, so there is no getBalance().
// The docs also don't officially describe sending to several numbers in one
// request, so we send one request per number (the queue handles volume).
import "server-only";
import { getEnv, isSmsDryRun } from "@/lib/env";
import { parseNaloResponse } from "./nalo-response";

/** Nalo's JSON send endpoint (same as used in production by other Nalo integrations). Override with NALO_API_URL. */
export const DEFAULT_NALO_API_URL = "https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/";

export type SendSmsResult = {
  ok: boolean;
  providerMessageId?: string;
  /** Raw reply from Nalo (stored in outbound_sms.provider_response). */
  raw: string;
  /** Readable reason when ok is false. */
  error?: string;
  /** Whether it's worth trying again automatically. */
  retryable: boolean;
};

/**
 * Which Nalo login to use: the API key if NALO_API_KEY is set, otherwise
 * NALO_USERNAME + NALO_PASSWORD. Returns null if neither is configured.
 */
export function naloCredentials(): { key: string } | { username: string; password: string } | null {
  const key = getEnv("NALO_API_KEY");
  if (key) return { key };
  const username = getEnv("NALO_USERNAME");
  const password = getEnv("NALO_PASSWORD");
  if (username && password) return { username, password };
  return null;
}

export async function sendSms({ to, message }: { to: string; message: string }): Promise<SendSmsResult> {
  if (isSmsDryRun()) {
    // Development / testing: pretend it worked, send nothing.
    console.log(`[SMS DRY RUN] to=${to} (${message.length} chars): ${message}`);
    return { ok: true, providerMessageId: `dry-run-${crypto.randomUUID()}`, raw: "DRY_RUN (nothing sent)", retryable: false };
  }

  // Configuration problems are NOT retried automatically: fix the setting, then "Retry failed".
  const credentials = naloCredentials();
  const senderId = getEnv("NALO_SENDER_ID");
  if (!credentials || !senderId) {
    const missing = [!credentials && "NALO_API_KEY (or NALO_USERNAME + NALO_PASSWORD)", !senderId && "NALO_SENDER_ID"].filter(Boolean).join(" and ");
    return { ok: false, raw: "NOT_CONFIGURED", error: `SMS is not set up: ${missing} missing. Ask your technical admin.`, retryable: false };
  }

  const url = getEnv("NALO_API_URL") ?? DEFAULT_NALO_API_URL;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...credentials, msisdn: to, message, sender_id: senderId }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Network problem or timeout: the request may not have reached Nalo.
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, raw: `NETWORK_ERROR: ${reason}`, error: `Could not reach Nalo (${reason}). It will be retried automatically.`, retryable: true };
  }

  const raw = (await response.text()).slice(0, 2000);
  const parsed = parseNaloResponse(response.status, raw);
  return { ok: parsed.ok, providerMessageId: parsed.providerMessageId, raw: `HTTP ${response.status}: ${raw}`, error: parsed.error, retryable: parsed.retryable };
}
