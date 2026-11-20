// QR codes for the registration form.
import { requireStaff } from "@/lib/auth";
import { siteUrl } from "@/lib/site-url";
import { PageHeader } from "@/components/admin/ui";
import { QrGenerator } from "./qr-generator";

export const metadata = { title: "QR codes" };

export default async function QrPage() {
  await requireStaff();
  return (
    <>
      <PageHeader
        title="QR codes"
        description="People scan the code with their phone camera to open the registration form."
      />
      <QrGenerator baseUrl={await siteUrl()} />
    </>
  );
}
