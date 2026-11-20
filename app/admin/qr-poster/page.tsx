// Printable A4 poster with the registration QR code: /admin/qr-poster?src=banner
import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";
import { Poster } from "./poster";

export const dynamic = "force-dynamic";
export const metadata = { title: "QR poster" };

export default async function PosterPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  await requireStaff();
  const { src } = await searchParams;
  const settings = await getSettings();
  return <Poster baseUrl={await siteUrl()} src={src ?? ""} churchName={settings.church_name} logoUrl={settings.logo_url} />;
}
