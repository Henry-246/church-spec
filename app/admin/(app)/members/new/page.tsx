import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/admin/ui";
import { MemberForm } from "../member-form";

export const metadata = { title: "Add member" };

export default async function NewMemberPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: groups } = await supabase.from("groups").select("id, name").order("name");
  return (
    <>
      <PageHeader title="Add member" description="New members added here do NOT receive the welcome SMS." />
      <MemberForm groups={groups ?? []} />
    </>
  );
}
