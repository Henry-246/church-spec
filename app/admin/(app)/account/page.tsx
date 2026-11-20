// My account: change own password.
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/ui";
import { PasswordForm } from "./password-form";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <>
      <PageHeader title="My account" description={`${staff.email} · ${staff.profile.role}`} />
      <h2 className="mb-3 font-medium">Change password</h2>
      <PasswordForm />
    </>
  );
}
