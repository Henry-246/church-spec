// Layout for every logged-in admin page: checks login, shows the menu.
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { isSmsDryRun } from "@/lib/env";
import { AdminNav } from "@/components/admin/nav";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const dryRun = isSmsDryRun();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b bg-muted/30 p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-4 print:hidden">
        <div className="mb-3 flex items-center justify-between gap-2 md:block">
          <Link href="/admin" className="font-semibold">
            Church SMS
          </Link>
          <div className="text-xs text-muted-foreground md:mt-1">
            {staff.profile.full_name || staff.email} · {staff.profile.role}
          </div>
        </div>
        <AdminNav role={staff.profile.role} />
        <div className="mt-3 flex gap-3 text-xs md:mt-6 md:flex-col md:gap-1">
          <Link href="/admin/account" className="text-muted-foreground hover:underline">
            My account
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="text-muted-foreground hover:underline">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {dryRun && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300 print:hidden">
            Test mode (SMS_DRY_RUN=true): messages are recorded but <b>no real SMS is sent</b>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
