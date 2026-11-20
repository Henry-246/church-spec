"use server";

// Handles the public registration form. Runs on the server only.
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTurnstile } from "@/lib/turnstile";
import { fieldErrors, registrationSchema } from "@/lib/validation";
import { kickQueue } from "@/lib/sms/queue";

export type JoinState = { errors: Record<string, string>; submittedAt?: number };

export async function registerAction(_prev: JoinState, formData: FormData): Promise<JoinState> {
  // 1. Spam check (Cloudflare Turnstile).
  const ip = (await headers()).get("cf-connecting-ip");
  const human = await verifyTurnstile(formData.get("cf-turnstile-response") as string | null, ip);
  if (!human) {
    return { errors: { form: "Please complete the security check and try again." }, submittedAt: Date.now() };
  }

  // 2. Validate.
  const parsed = registrationSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    gender: formData.get("gender"),
    birth_day: formData.get("birth_day"),
    birth_month: formData.get("birth_month"),
    birth_year: formData.get("birth_year"),
    email: formData.get("email"),
    location: formData.get("location"),
    status: formData.get("status"),
    group_ids: formData.getAll("group_ids"),
    sms_consent: formData.get("sms_consent") === "on",
    source: formData.get("source"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), submittedAt: Date.now() };

  // 3. Save (creates or updates by phone number; queues the welcome SMS for new people).
  const { data, error } = await createAdminClient().rpc("register_member", { p: parsed.data });
  if (error) {
    console.error("register_member failed:", error);
    return { errors: { form: "Sorry, something went wrong saving your details. Please try again." }, submittedAt: Date.now() };
  }

  // 4. Send the welcome SMS right away (after the visitor sees the thank-you page).
  if ((data as { is_new?: boolean } | null)?.is_new) after(kickQueue);

  redirect("/join/thanks");
}
