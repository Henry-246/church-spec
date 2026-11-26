// GET /admin/api/member-search?q=kofi → up to 10 members who can receive SMS.
// Used by the "One member" option when sending a message.
// (A plain route handler, not a Server Action: Next.js runs Server Actions one
// at a time per browser tab, which made live search and counting block each other.)
import { getStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!(await getStaff())) return Response.json({ error: "Please log in." }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const text = q.replace(/[,()*%\\"']/g, " ").trim();
  if (text.length < 2) return Response.json({ members: [] });

  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  const parts = [`full_name.ilike.%${text}%`];
  if (digits.length >= 2) parts.push(`phone.like.%${digits}%`);

  const { data, error } = await (await createClient())
    .from("members")
    .select("id, full_name, phone")
    .or(parts.join(","))
    .eq("sms_consent", true)
    .is("opted_out_at", null)
    .order("full_name")
    .limit(10);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ members: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
