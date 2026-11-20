import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin login" };

export default async function LoginPage() {
  let alreadyIn = false;
  try {
    alreadyIn = !!(await getStaff());
  } catch {
    // Supabase not configured yet: still show the form (it will show an error on submit).
  }
  if (alreadyIn) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold">Admin login</h1>
        <p className="mb-6 text-sm text-muted-foreground">For church staff only.</p>
        <LoginForm />
      </div>
    </main>
  );
}
