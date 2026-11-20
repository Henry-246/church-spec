// Settings (admins only): church details, welcome template, SMS status, test SMS.
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getEnv, isSmsDryRun } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { DEFAULT_NALO_API_URL, naloCredentials } from "@/lib/sms/nalo";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GeneralSettingsForm, TestSmsForm } from "./forms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const dryRun = isSmsDryRun();
  const senderId = getEnv("NALO_SENDER_ID");
  const credentials = naloCredentials();
  const login = !credentials ? null : "key" in credentials ? "API key" : `username ${credentials.username}`;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Church</CardTitle>
          </CardHeader>
          <CardContent>
            <GeneralSettingsForm settings={settings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SMS connection (Nalo)</CardTitle>
            <CardDescription>These come from the server configuration (see README) and cannot be changed here.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-1 text-sm">
              <li>
                Mode: {dryRun ? <b className="text-amber-700 dark:text-amber-400">TEST MODE (SMS_DRY_RUN=true): nothing is really sent</b> : <b className="text-green-700 dark:text-green-400">LIVE: real SMS are sent</b>}
              </li>
              <li>Sender ID: {senderId ? <b>{senderId}</b> : <span className="text-destructive">not set (NALO_SENDER_ID)</span>}</li>
              <li>Nalo login: {login ? <b>{login}</b> : <span className="text-destructive">not set (NALO_API_KEY, or NALO_USERNAME + NALO_PASSWORD)</span>}</li>
              <li className="break-all text-muted-foreground">Endpoint: {getEnv("NALO_API_URL") ?? DEFAULT_NALO_API_URL}</li>
              <li className="text-muted-foreground">Check your SMS credit balance on the Nalo client portal (Nalo&apos;s API has no balance check).</li>
            </ul>
            <div>
              <h3 className="mb-2 font-medium">Send a test SMS</h3>
              <TestSmsForm />
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Birthday settings are on the <Link href="/admin/birthdays" className="underline">Birthdays</Link> page. Admin users are on{" "}
          <Link href="/admin/users" className="underline">Admins</Link>.
        </p>
      </div>
    </>
  );
}
