"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { audienceSchema } from "@/lib/audience";
import { MAX_BODY } from "@/lib/sms/segments";

export type ReminderState = { error?: string };

const schema = z
  .object({
    name: z.string().trim().min(1, "Please give the reminder a name.").max(80),
    body: z.string().trim().min(1, "Please type the message.").max(MAX_BODY),
    audience: z.string().transform((s, ctx) => {
      try {
        return audienceSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ code: "custom", message: "Please choose who should receive it." });
        return z.NEVER;
      }
    }),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    days_of_week: z.array(z.coerce.number().int().min(0).max(6)),
    day_of_month: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(31).nullable()),
    send_time: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a time."),
    active: z.boolean(),
  })
  .refine((v) => v.frequency !== "weekly" || v.days_of_week.length > 0, { message: "Choose at least one day of the week." })
  .refine((v) => v.frequency !== "monthly" || v.day_of_month != null, { message: "Choose the day of the month." });

export async function saveReminderAction(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const staff = await requireStaff();
  const id = (formData.get("id") as string) || null;
  const parsed = schema.safeParse({
    name: formData.get("name"),
    body: formData.get("body"),
    audience: formData.get("audience"),
    frequency: formData.get("frequency"),
    days_of_week: formData.getAll("days_of_week"),
    day_of_month: formData.get("day_of_month"),
    send_time: formData.get("send_time"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  const row = {
    name: v.name,
    body: v.body,
    audience: v.audience,
    frequency: v.frequency,
    days_of_week: v.frequency === "weekly" ? v.days_of_week : [],
    day_of_month: v.frequency === "monthly" ? v.day_of_month : null,
    send_time: v.send_time,
    active: v.active,
    // Count from now: a time slot that already passed today is not sent
    // immediately after saving (see run_due_reminders in the database).
    last_run_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("recurring_reminders").update(row).eq("id", id)
    : await supabase.from("recurring_reminders").insert({ ...row, created_by: staff.userId });
  if (error) return { error: `Could not save: ${error.message}` };

  revalidatePath("/admin/reminders");
  redirect("/admin/reminders?saved=1");
}

export async function toggleReminderAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "1";
  const supabase = await createClient();
  await supabase
    .from("recurring_reminders")
    .update(active ? { active, last_run_at: new Date().toISOString() } : { active })
    .eq("id", id);
  revalidatePath("/admin/reminders");
}

export async function deleteReminderAction(formData: FormData) {
  await requireStaff();
  const supabase = await createClient();
  await supabase.from("recurring_reminders").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/reminders");
  redirect("/admin/reminders");
}
