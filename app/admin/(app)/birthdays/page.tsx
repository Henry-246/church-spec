// Birthdays: settings (admins) and upcoming birthdays (everyone).
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { ghanaToday } from "@/lib/time";
import { MONTHS } from "@/lib/types";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BirthdaySettingsForm } from "../settings/forms";

export const metadata = { title: "Birthdays" };

export default async function BirthdaysPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const settings = await getSettings();
  const today = ghanaToday();
  const nextMonth = (today.month % 12) + 1;

  const [{ data: upcoming }, { data: recent }] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name, birth_day, birth_month, sms_consent, opted_out_at")
      .in("birth_month", [today.month, nextMonth])
      .order("birth_month")
      .order("birth_day"),
    supabase.from("campaigns").select("id, created_at, recipient_count, sent_count, failed_count").eq("type", "birthday").order("created_at", { ascending: false }).limit(10),
  ]);

  // Next 30 days, in date order (handles December → January).
  const daysUntil = (m: number, d: number) => {
    const year = m < today.month ? today.year + 1 : today.year;
    return Math.round((Date.UTC(year, m - 1, d) - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
  };
  const list = (upcoming ?? [])
    .map((m) => ({ ...m, inDays: daysUntil(m.birth_month!, m.birth_day!) }))
    .filter((m) => m.inDays >= 0 && m.inDays <= 30)
    .sort((a, b) => a.inDays - b.inDays);

  return (
    <>
      <PageHeader title="Birthdays" description="Each member gets at most one birthday SMS per year." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Birthday SMS</CardTitle>
          </CardHeader>
          <CardContent>
            <BirthdaySettingsForm settings={settings} readOnly={staff.profile.role !== "admin"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No birthdays in the next 30 days.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {list.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <Link href={`/admin/members/${m.id}`} className="hover:underline">
                      {m.full_name}
                      {(!m.sms_consent || m.opted_out_at) && <span className="text-xs text-muted-foreground"> (no SMS)</span>}
                    </Link>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {m.inDays === 0 ? "Today 🎉" : m.inDays === 1 ? "Tomorrow" : `${m.birth_day} ${MONTHS[m.birth_month! - 1].slice(0, 3)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {!!recent?.length && (
              <>
                <h3 className="mt-6 mb-2 text-sm font-medium">Recent birthday sends</h3>
                <ul className="grid gap-1 text-sm">
                  {recent.map((c) => (
                    <li key={c.id}>
                      <Link href={`/admin/messages/${c.id}`} className="hover:underline">
                        {new Date(c.created_at).toISOString().slice(0, 10)}: {c.sent_count}/{c.recipient_count} sent
                        {c.failed_count ? `, ${c.failed_count} failed` : ""}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
