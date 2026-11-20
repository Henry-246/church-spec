"use server";

// Managing who can log in to /admin (admins only).
// Uses the service-role key because creating logins needs Supabase's admin API.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserState = { error?: string; created?: { email: string; password: string } };

/** A readable temporary password, e.g. "Kofi-7Q4M-2XRW". */
function tempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `Church-${s.slice(0, 4)}-${s.slice(4)}`;
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email."),
  full_name: z.string().trim().min(1, "Please enter a name.").max(80),
  role: z.enum(["admin", "editor"]),
});

export async function createUserAction(_prev: UserState, formData: FormData): Promise<UserState> {
  await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, full_name, role } = parsed.data;

  const db = createAdminClient();
  const password = tempPassword();
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
  if (error || !data.user) {
    return { error: error?.message.includes("already") ? "A login with this email already exists." : `Could not create login: ${error?.message}` };
  }
  const { error: profileError } = await db.from("profiles").insert({ id: data.user.id, full_name, role });
  if (profileError) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: `Could not save profile: ${profileError.message}` };
  }
  revalidatePath("/admin/users");
  return { created: { email, password } };
}

async function adminCount(db: ReturnType<typeof createAdminClient>) {
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function changeRoleAction(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id"));
  const role = formData.get("role") === "admin" ? "admin" : "editor";
  const db = createAdminClient();
  if (role === "editor" && id === me.userId && (await adminCount(db)) <= 1) {
    throw new Error("You are the only admin. Make someone else admin first.");
  }
  await db.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin/users");
}

export async function removeUserAction(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id"));
  if (id === me.userId) throw new Error("You cannot remove yourself.");
  const db = createAdminClient();
  // Deleting the login also deletes the profile (ON DELETE CASCADE).
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(_prev: UserState, formData: FormData): Promise<UserState> {
  await requireAdmin();
  const id = String(formData.get("id"));
  const email = String(formData.get("email"));
  const password = tempPassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
  if (error) return { error: error.message };
  return { created: { email, password } };
}
