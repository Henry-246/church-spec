"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createCampaign, processQueueBatch } from "@/lib/sms/queue";
import { normalizeGhanaPhone } from "@/lib/phone";
import { MAX_BODY } from "@/lib/sms/segments";

export type SettingsState = { error?: string; saved?: boolean };

const time = z.string().regex(/^\d{2}:\d{2}$/, "Please choose a valid time.");
const template = z.string().trim().min(1, "Templates cannot be empty.").max(MAX_BODY);

const generalSchema = z.object({
  church_name: z.string().trim().min(1, "Church name is required.").max(80),
  logo_url: z.preprocess((v) => (v === "" ? null : v), z.string().url("Logo must be a full web address (https://…)").max(500).nullable()),
  sender_id_display: z.preprocess((v) => (v === "" ? null : v), z.string().max(11, "Sender IDs are at most 11 characters.").nullable()),
  welcome_template: template,
  default_send_time: time,
});

const birthdaySchema = z.object({
  birthday_enabled: z.boolean(),
  birthday_template: template,
  birthday_send_time: time,
});

export async function saveGeneralSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();
  const parsed = generalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await (await createClient()).from("settings").update(parsed.data).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function saveBirthdaySettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();
  const parsed = birthdaySchema.safeParse({
    birthday_enabled: formData.get("birthday_enabled") === "on",
    birthday_template: formData.get("birthday_template"),
    birthday_send_time: formData.get("birthday_send_time"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await (await createClient()).from("settings").update(parsed.data).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/birthdays");
  return { saved: true };
}

export type TestSmsState = { error?: string };

/** Sends one SMS to a phone number right away and shows the result. */
export async function sendTestSmsAction(_prev: TestSmsState, formData: FormData): Promise<TestSmsState> {
  const staff = await requireStaff();
  const phone = normalizeGhanaPhone(String(formData.get("phone") ?? ""));
  if (!phone.ok) return { error: phone.error };
  const message = String(formData.get("message") ?? "").trim() || "Test message from {church_name}. If you got this, SMS is working!";

  let campaignId: string;
  try {
    const c = await createCampaign({ type: "test", body: message, audience: { type: "phone", phone: phone.phone }, createdBy: staff.userId });
    campaignId = c.id;
    await processQueueBatch(); // send now and wait, so the result page shows the outcome
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  redirect(`/admin/messages/${campaignId}`);
}
