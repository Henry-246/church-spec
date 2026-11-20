// Who is logged in, and are they allowed in? Used by every admin page and action.
import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type Staff = { userId: string; email: string; profile: Profile };

/** Returns the logged-in admin/editor, or null if not logged in / not staff. */
export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) return null;

  return { userId: user.id, email: user.email ?? "", profile };
}

/** For pages/actions any staff member may use. Sends others to the login page. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  return staff;
}

/** For admin-only pages/actions (settings, users, editing members). */
export async function requireAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.profile.role !== "admin") redirect("/admin?error=admins-only");
  return staff;
}
