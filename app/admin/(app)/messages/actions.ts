"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audienceSchema } from "@/lib/audience";
import { countAudience, createCampaign, kickQueue } from "@/lib/sms/queue";
import { fromGhanaLocalInput } from "@/lib/time";
import { MAX_BODY } from "@/lib/sms/segments";
import type { Audience } from "@/lib/types";



/** Member search for the "single member" audience option. */
export async function searchMembersAction(q: string): Promise<{ id: string; full_name: string; phone: string }[]> {
  await requireStaff();
  const text = q.replace(/[,()*%\\"']/g, " ").trim();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  const parts = [`full_name.ilike.%${text}%`];
  if (digits.length >= 3) parts.push(`phone.like.%${digits}%`);
  const { data } = await (await createClient())
    .from("members")
    .select("id, full_name, phone")
    .or(parts.join(","))
    .eq("sms_consent", true)
    .is("opted_out_at", null)
    .order("full_name")
    .limit(10);
  return data ?? [];
}

/** How many people an audience reaches right now. */
export async function countAudienceAction(audience: Audience): Promise<number | null> {
  await requireStaff();
  const parsed = audienceSchema.safeParse(audience);
  if (!parsed.success) return null;
  return countAudience(parsed.data);
}

export type SendState = { error?: string };

const sendSchema = z.object({
  body: z.string().trim().min(1, "Please type a message.").max(MAX_BODY, `Message is too long (max ${MAX_BODY} characters).`),
  audience: z.string().transform((s, ctx) => {
    try {
      return audienceSchema.parse(JSON.parse(s));
    } catch {
      ctx.addIssue({ code: "custom", message: "Please choose who should receive the message." });
      return z.NEVER;
    }
  }),
  when: z.enum(["now", "later"]),
  scheduled_for: z.string().optional(),
});

export async function sendMessageAction(_prev: SendState, formData: FormData): Promise<SendState> {
  const staff = await requireStaff();
  const parsed = sendSchema.safeParse({
    body: formData.get("body"),
    audience: formData.get("audience"),
    when: formData.get("when"),
    scheduled_for: formData.get("scheduled_for") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { body, audience, when } = parsed.data;

  let scheduledFor: Date | null = null;
  if (when === "later") {
    scheduledFor = fromGhanaLocalInput(parsed.data.scheduled_for ?? "");
    if (!scheduledFor) return { error: "Please choose a valid date and time." };
    if (scheduledFor.getTime() < Date.now() - 60_000) return { error: "The scheduled time is in the past." };
  }

  let campaignId: string;
  try {
    const result = await createCampaign({ type: "manual", body, audience, createdBy: staff.userId, scheduledFor });
    if (!result.scheduled && result.recipients === 0) {
      return { error: "No one matches this audience (people without SMS consent or who opted out are excluded)." };
    }
    campaignId = result.id;
    // Start sending immediately, after the page has responded.
    if (!result.scheduled) after(kickQueue);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send." };
  }
  revalidatePath("/admin/messages");
  redirect(`/admin/messages/${campaignId}?created=1`);
}

/** Retry failed SMS of a campaign (all failed ones, or one). */
export async function retryFailedAction(formData: FormData) {
  await requireStaff();
  const campaignId = String(formData.get("campaign_id"));
  const smsId = formData.get("sms_id") ? [String(formData.get("sms_id"))] : null;
  const { error } = await createAdminClient().rpc("retry_failed_sms", { p_campaign_id: campaignId, p_sms_ids: smsId });
  if (error) throw new Error(error.message);
  after(kickQueue);
  revalidatePath(`/admin/messages/${campaignId}`);
  redirect(`/admin/messages/${campaignId}?retried=1`);
}

/** Cancel a scheduled or in-progress send. */
export async function cancelCampaignAction(formData: FormData) {
  await requireStaff();
  const campaignId = String(formData.get("campaign_id"));
  const { error } = await createAdminClient().rpc("cancel_campaign", { p_campaign_id: campaignId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/messages/${campaignId}`);
  revalidatePath("/admin/messages");
}

/** "Check for updates" button on a send that is in progress: sends one more batch now. */
export async function sendNextBatchAction(formData: FormData) {
  await requireStaff();
  await kickQueue();
  revalidatePath(`/admin/messages/${String(formData.get("campaign_id"))}`);
}
