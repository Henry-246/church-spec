// POST /admin/api/audience-count  body: {"audience": {...}} → {"count": 12}
// Live "Recipients: N" number on the send-message and reminder forms.
// (A plain route handler, not a Server Action, so it never waits behind other requests.)
import { getStaff } from "@/lib/auth";
import { audienceSchema } from "@/lib/audience";
import { countAudience } from "@/lib/sms/queue";

export async function POST(request: Request) {
  if (!(await getStaff())) return Response.json({ error: "Please log in." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = audienceSchema.safeParse((body as { audience?: unknown })?.audience);
  if (!parsed.success) return Response.json({ error: "Invalid audience." }, { status: 400 });

  try {
    return Response.json({ count: await countAudience(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
