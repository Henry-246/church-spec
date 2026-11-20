// Central place to read configuration (environment variables).
//
// IMPORTANT: every value is read at RUNTIME on the server, never baked in at
// build time. That way the same build works everywhere and all settings live
// in one place: Cloudflare (production) or `.dev.vars` (local development).
// Public values the browser needs (e.g. Turnstile site key) are passed down to
// client components as props by server components.
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type EnvName =
  | "NEXT_PUBLIC_SITE_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "NALO_API_KEY"
  | "NALO_SENDER_ID"
  | "SMS_DRY_RUN"
  | "CRON_SECRET"
  | "NEXT_PUBLIC_TURNSTILE_SITE_KEY"
  | "TURNSTILE_SECRET_KEY"
  | "NALO_USERNAME" // alternative to NALO_API_KEY
  | "NALO_PASSWORD" // alternative to NALO_API_KEY
  | "NALO_API_URL" // optional, see lib/sms/nalo.ts
  | "QUEUE_BATCH_SIZE"; // optional, SMS sent per queue run (default 20)

/** Read an env var; returns undefined if it is not set. */
export function getEnv(name: EnvName): string | undefined {
  let value: unknown;
  try {
    // Cloudflare bindings (vars + secrets). In `next dev` these come from .dev.vars.
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    value = env[name];
  } catch {
    // Not inside a Cloudflare request context (e.g. during build) — fall through.
  }
  if (typeof value !== "string" || value === "") {
    // Dynamic lookup on purpose, so Next.js cannot inline it at build time.
    value = process.env[name];
  }
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Read a required env var; throws a clear error if it is missing. */
export function requireEnv(name: EnvName): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .dev.vars (local) or with "npx wrangler secret put ${name}" (Cloudflare).`,
    );
  }
  return value;
}

/** True unless SMS_DRY_RUN is explicitly "false". Safe default: do not send real SMS. */
export function isSmsDryRun(): boolean {
  return getEnv("SMS_DRY_RUN")?.toLowerCase() !== "false";
}
