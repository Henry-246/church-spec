// New reminder (/admin/reminders/new) or edit an existing one.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import type { RecurringReminder } from "@/lib/types";
import { PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/form-bits";
import { ReminderForm } from "../reminder-form";
import { deleteReminderAction } from "../actions";

export const metadata = { title: "Reminder" };

export default async function ReminderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff();
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [settings, { data: groups }, { data: sample }, reminderResult, { data: runs }] = await Promise.all([
    getSettings(),
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("members").select("first_name, full_name").eq("sms_consent", true).is("opted_out_at", null).limit(1),
    isNew ? Promise.resolve({ data: null }) : supabase.from("recurring_reminders").select("*").eq("id", id).maybeSingle(),
    isNew
      ? Promise.resolve({ data: [] })
      : supabase.from("campaigns").select("id, scheduled_for, status, recipient_count, sent_count, failed_count").eq("recurring_reminder_id", id).order("scheduled_for", { ascending: false }).limit(10),
  ]);
  const reminder = reminderResult.data as RecurringReminder | null;
  if (!isNew && !reminder) notFound();

  return (
    <>
      <PageHeader title={isNew ? "New reminder" : `Edit: ${reminder!.name}`} />
      <ReminderForm reminder={reminder ?? undefined} groups={groups ?? []} churchName={settings.church_name} sample={sample?.[0] ?? null} />
      {reminder && (
        <>
          <h2 className="mt-10 mb-3 text-lg font-semibold">Recent sends</h2>
          {runs?.length ? (
            <ul className="grid max-w-2xl gap-1 text-sm">
              {runs.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/messages/${c.id}`} className="hover:underline">
                    {formatDateTime(c.scheduled_for)}: {c.sent_count}/{c.recipient_count} sent{c.failed_count ? `, ${c.failed_count} failed` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not sent yet.</p>
          )}
          <form action={deleteReminderAction} className="mt-8 border-t pt-6">
            <input type="hidden" name="id" value={reminder.id} />
            <ConfirmButton variant="destructive" confirmText="Delete this reminder? Past send history is kept.">
              Delete reminder
            </ConfirmButton>
          </form>
        </>
      )}
    </>
  );
}
