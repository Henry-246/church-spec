// Protects the /api/jobs/* endpoints: the caller (scheduler worker) must send
//   Authorization: Bearer <CRON_SECRET>
import "server-only";
import { getEnv } from "@/lib/env";

/** Compares two strings in constant time (avoids leaking the secret through timing). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Returns a 401/500 Response if not allowed, or null if OK. */
export function checkCronAuth(request: Request): Response | null {
  const secret = getEnv("CRON_SECRET");
  if (!secret || secret.length < 16) {
    return Response.json({ error: "CRON_SECRET is not configured (min 16 characters)." }, { status: 500 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
