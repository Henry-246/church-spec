// Admin users (who can log in to /admin).
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/time";
import type { Profile } from "@/lib/types";
import { PageHeader } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/form-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { changeRoleAction, removeUserAction } from "./actions";
import { CreateUserForm, ResetPasswordForm } from "./forms";

export const metadata = { title: "Admins" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const db = createAdminClient();
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    db.from("profiles").select("*").order("created_at"),
    db.auth.admin.listUsers({ perPage: 200 }),
  ]);
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, { email: u.email ?? "", lastSignIn: u.last_sign_in_at }]));

  return (
    <>
      <PageHeader title="Admins & editors" description="People who can log in to this dashboard." />
      <ul className="mb-8 grid max-w-3xl gap-2">
        {((profiles ?? []) as Profile[]).map((p) => {
          const info = emailById.get(p.id);
          const isMe = p.id === me.userId;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-48 flex-1">
                <div className="font-medium">
                  {p.full_name || "(no name)"} {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                <div className="text-sm text-muted-foreground">{info?.email}</div>
                <div className="text-xs text-muted-foreground">Last login: {formatDate(info?.lastSignIn)}</div>
              </div>
              <form action={changeRoleAction} className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="role" value={p.role === "admin" ? "editor" : "admin"} />
                <span className="text-sm capitalize">{p.role}</span>
                <SubmitButton size="sm" variant="outline" pendingText="…">
                  {p.role === "admin" ? "Make editor" : "Make admin"}
                </SubmitButton>
              </form>
              {!isMe && (
                <>
                  <ResetPasswordForm id={p.id} email={info?.email ?? ""} />
                  <form action={removeUserAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmButton size="sm" variant="destructive" confirmText={`Remove ${p.full_name || info?.email}'s access? Their login will be deleted.`}>
                      Remove
                    </ConfirmButton>
                  </form>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Add a person</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>
    </>
  );
}
