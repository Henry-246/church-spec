// Groups / ministries: create, rename, delete.
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice, PageHeader } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/form-bits";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Groups" };

function errorText(code?: string, message?: string) {
  return code === "23505" ? "A group with that name already exists." : message ?? "Something went wrong.";
}

async function createGroup(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/admin/groups?error=Please+enter+a+name");
  const { error } = await (await createClient()).from("groups").insert({ name: name.slice(0, 60) });
  if (error) redirect(`/admin/groups?error=${encodeURIComponent(errorText(error.code, error.message))}`);
  revalidatePath("/admin/groups");
}

async function renameGroup(formData: FormData) {
  "use server";
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const { error } = await (await createClient()).from("groups").update({ name: name.slice(0, 60) }).eq("id", String(formData.get("id")));
  if (error) redirect(`/admin/groups?error=${encodeURIComponent(errorText(error.code, error.message))}`);
  revalidatePath("/admin/groups");
}

async function deleteGroup(formData: FormData) {
  "use server";
  await requireAdmin();
  await (await createClient()).from("groups").delete().eq("id", String(formData.get("id")));
  revalidatePath("/admin/groups");
}

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const staff = await requireStaff();
  const isAdmin = staff.profile.role === "admin";
  const supabase = await createClient();
  const { data: groups } = await supabase.from("groups").select("id, name, member_groups(count)").order("name");

  return (
    <>
      <PageHeader title="Groups & ministries" description="Members choose these on the registration form. You can message a whole group." />
      {error && <Notice kind="error">{error}</Notice>}

      {isAdmin && (
        <form action={createGroup} className="mb-6 flex max-w-md gap-2">
          <Input name="name" placeholder="New group name, e.g. Choir" required maxLength={60} />
          <SubmitButton pendingText="Adding…">Add</SubmitButton>
        </form>
      )}

      <ul className="grid max-w-2xl gap-2">
        {(groups ?? []).map((g) => {
          const count = (g.member_groups as unknown as { count: number }[])[0]?.count ?? 0;
          return (
            <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              {isAdmin ? (
                <form action={renameGroup} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <Input name="name" defaultValue={g.name} className="max-w-xs" maxLength={60} aria-label="Group name" />
                  <SubmitButton variant="outline" size="sm" pendingText="…">
                    Rename
                  </SubmitButton>
                </form>
              ) : (
                <span className="flex-1 font-medium">{g.name}</span>
              )}
              <Link href={`/admin/members?group=${g.id}`} className="text-sm text-muted-foreground hover:underline">
                {count} {count === 1 ? "member" : "members"}
              </Link>
              {isAdmin && (
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <ConfirmButton variant="ghost" size="sm" confirmText={`Delete the group "${g.name}"? Members stay, they are just removed from this group.`}>
                    Delete
                  </ConfirmButton>
                </form>
              )}
            </li>
          );
        })}
        {!groups?.length && <li className="text-sm text-muted-foreground">No groups yet.</li>}
      </ul>
    </>
  );
}
