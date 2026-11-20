import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/admin/ui";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import members" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Import members from CSV" description="Upload a spreadsheet saved as CSV (Excel: File → Save As → CSV UTF-8)." />
      <div className="mb-6 max-w-2xl space-y-2 text-sm text-muted-foreground">
        <p>
          The first row must contain column names. Required: <code>full_name</code> (or <code>name</code>) and{" "}
          <code>phone</code>. Optional: <code>gender</code>, <code>birth_day</code>, <code>birth_month</code> (number or name),{" "}
          <code>birth_year</code>, <code>email</code>, <code>location</code>, <code>status</code> (member / regular visitor /
          first-time visitor), <code>groups</code> (separated by <code>;</code>), <code>sms_consent</code> (yes/no),{" "}
          <code>notes</code>.
        </p>
        <p>
          People already in the system (same phone number) are updated, not duplicated. Empty cells never erase existing
          details. Missing groups are created. Imported people do <b>not</b> get the welcome SMS.
        </p>
        <p>
          Tip: export the current list first to get a file in the right format.
        </p>
      </div>
      <ImportForm />
    </>
  );
}
