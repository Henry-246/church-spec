"use server";

import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireStaff();
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Please use at least 10 characters." };
  if (password !== formData.get("confirm")) return { error: "The two passwords do not match." };
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}
