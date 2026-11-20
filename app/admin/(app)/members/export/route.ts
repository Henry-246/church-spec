// GET /admin/members/export → CSV download of members (same filters as the list).
import { getStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { MEMBER_STATUSES, type Member } from "@/lib/types";

export async function GET(request: Request) {
  const staff = await getStaff();
  if (!staff) return new Response("Please log in.", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const supabase = await createClient();
  const { data: groups } = await supabase.from("groups").select("id, name");
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  const all: (Member & { member_groups: { group_id: string }[] })[] = [];
  // Supabase returns at most 1000 rows per request, so fetch in pages.
  for (let from = 0; ; from += 1000) {
    let query = supabase.from("members").select(
      sp.get("group") ? "*, member_groups!inner(group_id)" : "*, member_groups(group_id)",
    );
    const q = sp.get("q");
    if (q) {
      const text = q.replace(/[,()*%\\"']/g, " ").trim();
      const digits = text.replace(/\D/g, "").replace(/^0+/, "");
      const parts = [`full_name.ilike.%${text}%`];
      if (digits.length >= 3) parts.push(`phone.like.%${digits}%`);
      if (text) query = query.or(parts.join(","));
    }
    const status = sp.get("status");
    if (status && (MEMBER_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
    if (sp.get("group")) query = query.eq("member_groups.group_id", sp.get("group")!);
    if (sp.get("consent") === "yes") query = query.eq("sms_consent", true).is("opted_out_at", null);
    if (sp.get("consent") === "no") query = query.eq("sms_consent", false);
    if (sp.get("consent") === "opted_out") query = query.not("opted_out_at", "is", null);
    const month = Number(sp.get("month"));
    if (month >= 1 && month <= 12) query = query.eq("birth_month", month);

    const { data, error } = await query.order("created_at").range(from, from + 999);
    if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });
    all.push(...((data ?? []) as unknown as typeof all));
    if (!data || data.length < 1000) break;
  }

  const headers = [
    "full_name", "phone", "gender", "birth_day", "birth_month", "birth_year", "email", "location",
    "status", "groups", "sms_consent", "opted_out", "source", "notes", "created_at",
  ];
  const rows = all.map((m) => [
    m.full_name,
    m.phone,
    m.gender,
    m.birth_day,
    m.birth_month,
    m.birth_year,
    m.email,
    m.location,
    m.status,
    (m.member_groups ?? []).map((l) => groupName.get(l.group_id)).filter(Boolean).join("; "),
    m.sms_consent ? "yes" : "no",
    m.opted_out_at ? "yes" : "no",
    m.source,
    m.notes,
    m.created_at,
  ]);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
