// Public registration page: /join (optionally /join?src=banner).
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import type { Group } from "@/lib/types";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const settings = await getSettings();
    return { title: `Join ${settings.church_name}` };
  } catch {
    return { title: "Join us" };
  }
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams;
  const siteKey = getEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY");

  let churchName = "Our Church";
  let logoUrl: string | null = null;
  let groups: Pick<Group, "id" | "name">[] = [];
  try {
    const settings = await getSettings();
    churchName = settings.church_name;
    logoUrl = settings.logo_url;
    const { data } = await createAdminClient().from("groups").select("id, name").order("name");
    groups = data ?? [];
  } catch (err) {
    console.error("Join page could not load settings:", err);
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">Registration is temporarily unavailable</h1>
        <p className="mt-2 text-muted-foreground">Please try again in a few minutes.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:py-10">
      <header className="mb-6 flex flex-col items-center gap-3 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external logo URL from settings
          <img src={logoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to {churchName}</h1>
        <p className="text-sm text-muted-foreground">Please fill in your details so we can stay in touch.</p>
      </header>
      {siteKey ? (
        <JoinForm churchName={churchName} groups={groups} siteKey={siteKey} source={src?.slice(0, 60) ?? ""} />
      ) : (
        <p className="text-center text-destructive">Form not configured: NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing.</p>
      )}
    </main>
  );
}
