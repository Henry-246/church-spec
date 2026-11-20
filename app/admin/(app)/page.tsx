// Admin dashboard home: key numbers at a glance.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard" };

/** Monday 00:00 of this week, Ghana time (= UTC). */
function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const week = startOfWeek(now).toISOString();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [total, newWeek, newMonth, sentMonth, failedMonth, pendingNow] = await Promise.all([
    count(supabase.from("members").select("id", { count: "exact", head: true })),
    count(supabase.from("members").select("id", { count: "exact", head: true }).gte("created_at", week)),
    count(supabase.from("members").select("id", { count: "exact", head: true }).gte("created_at", month)),
    count(supabase.from("outbound_sms").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", month)),
    count(supabase.from("outbound_sms").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", month)),
    count(supabase.from("outbound_sms").select("id", { count: "exact", head: true }).in("status", ["pending", "sending"])),
  ]);

  const stats = [
    { label: "Total members", value: total, href: "/admin/members" },
    { label: "New this week", value: newWeek, href: "/admin/members?sort=newest" },
    { label: "New this month", value: newMonth, href: "/admin/members?sort=newest" },
    { label: "SMS sent this month", value: sentMonth, href: "/admin/messages" },
    { label: "Failed SMS this month", value: failedMonth, href: "/admin/messages?failed=1" },
    { label: "Waiting to send", value: pendingNow, href: "/admin/messages" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <Button nativeButton={false} render={<Link href="/admin/messages/new" />}>
            Send a message
          </Button>
        }
      />
      {error === "admins-only" && <Notice kind="warning">That page is for admins only.</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-semibold ${s.label.startsWith("Failed") && s.value > 0 ? "text-destructive" : ""}`}>
                  {s.value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
