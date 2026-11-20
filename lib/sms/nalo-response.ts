// Understands Nalo's replies. Kept separate from nalo.ts so it can be unit
// tested without network or environment variables.
//
// From Nalo's API documentation (Postman collection 7705958/Uyr7Hydn):
//   JSON POST success: {"status":"1701","job_id":"api.0000011.20221222.0000003","msisdn":"233244071872"}
//   GET success:       1701|233501371674|api.0000011.20220418.0000001
//   XML error:         <root><code>1707</code><message>Invalid Source(Sender)</message></root>
// The docs do not show a JSON error example, so we accept "status" or "code"
// in JSON, and also plain-text and XML replies, to be safe.

export type NaloResult = {
  ok: boolean;
  /** Nalo's code, e.g. "1701" (success) or "1025" (no credit). */
  code?: string;
  /** Nalo's message ID ("job_id"), used to match delivery reports. */
  providerMessageId?: string;
  /** Human readable reason when ok is false. */
  error?: string;
  /** Whether trying again later might work (temporary problem). */
  retryable: boolean;
};

export const NALO_SUCCESS_CODE = "1701";

/** Nalo response codes → plain-English explanations shown in Message history. */
export const NALO_CODES: Record<string, { message: string; retryable: boolean }> = {
  "1701": { message: "Message submitted successfully.", retryable: false },
  "1702": { message: "Nalo rejected the request because a required field was missing or blank (check the API key and sender ID settings).", retryable: false },
  "1703": { message: "Nalo says the username/password or API key is invalid.", retryable: false },
  "1704": { message: "Nalo rejected the message type.", retryable: false },
  "1705": { message: "Nalo rejected the message text as invalid (empty or unsupported characters).", retryable: false },
  "1706": { message: "Invalid destination phone number.", retryable: false },
  "1707": { message: "The sender ID is invalid or not yet approved by Nalo.", retryable: false },
  "1708": { message: "Nalo rejected the delivery-report setting.", retryable: false },
  "1709": { message: "Nalo could not validate the account (check the API key).", retryable: false },
  "1710": { message: "Nalo had an internal error. It will be retried automatically.", retryable: true },
  "1025": { message: "Not enough SMS credit on the Nalo account. Top up, then retry.", retryable: false },
  "1026": { message: "Nalo reseller account is out of credit. Contact Nalo, then retry.", retryable: false },
};

function fromCode(code: string, providerMessageId?: string, fallbackText?: string): NaloResult {
  if (code === NALO_SUCCESS_CODE) return { ok: true, code, providerMessageId, retryable: false };
  const known = NALO_CODES[code];
  if (known) return { ok: false, code, error: `${known.message} (code ${code})`, retryable: known.retryable };
  return {
    ok: false,
    code,
    error: `Nalo returned an unknown code ${code}${fallbackText ? `: ${fallbackText}` : ""}.`,
    retryable: false,
  };
}

function xmlTag(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`, "i"))?.[1];
}

/**
 * Turns Nalo's HTTP reply into a result.
 * Unknown replies are NOT retried automatically: Nalo may have sent the SMS,
 * and we never want to send the same message twice.
 */
export function parseNaloResponse(httpStatus: number, body: string): NaloResult {
  const text = (body ?? "").trim();

  // 1) JSON
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      const code = String(json.status ?? json.code ?? "").trim();
      const jobId = json.job_id != null ? String(json.job_id) : undefined;
      if (code) return fromCode(code, jobId, typeof json.message === "string" ? json.message : undefined);
    } catch {
      // fall through to the other formats
    }
  }

  // 2) XML
  if (text.startsWith("<")) {
    const code = xmlTag(text, "status") ?? xmlTag(text, "code");
    if (code) return fromCode(code.trim(), xmlTag(text, "job_id"), xmlTag(text, "message"));
  }

  // 3) Plain text "1701|233XXXXXXXXX|messageId" or just "1707"
  const plain = text.match(/^(\d{4})(?:\|([^|]*)\|?(.*))?$/);
  if (plain) return fromCode(plain[1], plain[3] || undefined);

  // 4) Nothing recognisable.
  if (httpStatus >= 500) {
    return { ok: false, error: `Nalo server error (HTTP ${httpStatus}). It will be retried automatically.`, retryable: true };
  }
  return {
    ok: false,
    error: `Unrecognised reply from Nalo (HTTP ${httpStatus}). The SMS may or may not have been sent; check before retrying.`,
    retryable: false,
  };
}
