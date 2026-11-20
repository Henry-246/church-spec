// Recurring reminders list.
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeAudience } from "@/lib/audience";
import { describeSchedule, nextRun } from "@/lib/reminders";
import { formatDateTime } from "@/lib/time";
import type { RecurringReminder } from "@/lib/types";
import { Notice, PageHeader } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/form-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toggleReminderAction } from "./actions";

export const metadata = { title: "Reminders" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const [{ data }, { data: groups }] = await Promise.all([
    supabase.from("recurring_reminders").select("*").order("created_at"),
    supabase.from("groups").select("id, name"),
  ]);
  const reminders = (data ?? []) as RecurringReminder[];
  const groupNames = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]));

  return (
    <>
      <PageHeader
        title="Recurring reminders"
        description="Messages sent automatically on a schedule (Ghana time). Each time slot is sent once."
        actions={
          <Button nativeButton={false} render={<Link href="/admin/reminders/new" />}>
            New reminder
          </Button>
        }
      />
      {saved && <Notice kind="success">Reminder saved.</Notice>}
      <ul className="grid max-w-3xl gap-3">
        {reminders.map((r) => {
          const next = r.active ? nextRun(r) : null;
          return (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link href={`/admin/reminders/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                {r.active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Paused</Badge>}
                <form action={toggleReminderAction} className="ml-auto">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="active" value={r.active ? "0" : "1"} />
                  <SubmitButton variant="outline" size="sm" pendingText="…">
                    {r.active ? "Pause" : "Resume"}
                  </SubmitButton>
                </form>
              </div>
              <p className="text-sm">
                {describeSchedule(r)} → {describeAudience(r.audience, groupNames)}
              </p>
              {next && <p className="text-xs text-muted-foreground">Next: {formatDateTime(next)}</p>}
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.body}</p>
            </li>
          );
        })}
        {reminders.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No reminders yet. Example: every Saturday at 18:00 → all members → &quot;Hi {"{first_name}"}, join us tomorrow at 8am!&quot;
          </li>
        )}
      </ul>
    </>
  );
}
