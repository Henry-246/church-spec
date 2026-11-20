// Compose and send (or schedule) a message.
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { tomorrowAtInput } from "@/lib/time";
import { PageHeader } from "@/components/admin/ui";
import { Composer } from "./composer";

export const metadata = { title: "Send message" };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ member?: string }> }) {
  const { member: memberId } = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const settings = await getSettings();

  const [{ data: groups }, { data: sampleRows }, presetResult] = await Promise.all([
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("members").select("first_name, full_name").eq("sms_consent", true).is("opted_out_at", null).limit(1),
    memberId && /^[0-9a-f-]{36}$/i.test(memberId)
      ? supabase.from("members").select("id, full_name, phone, first_name").eq("id", memberId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const preset = presetResult.data as { id: string; full_name: string; phone: string; first_name: string } | null;

  return (
    <>
      <PageHeader title="Send a message" description="Times are Ghana time." />
      <Composer
        groups={groups ?? []}
        churchName={settings.church_name}
        sample={preset ?? sampleRows?.[0] ?? null}
        presetMember={preset}
        defaultSchedule={tomorrowAtInput(settings.default_send_time)}
      />
    </>
  );
}
