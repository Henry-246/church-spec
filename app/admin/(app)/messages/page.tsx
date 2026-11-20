// Message history: every send (announcements, reminders, welcome, birthdays).
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import { describeAudience } from "@/lib/audience";
import { CAMPAIGN_TYPE_LABELS, type Campaign, type CampaignType } from "@/lib/types";
import { PageHeader, Pager, StatusBadge, withParams } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Message history" };
const PAGE_SIZE = 30;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string; failed?: string }> }) {
  const sp = await searchParams;
  await requireStaff();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  let query = supabase.from("campaigns").select("*", { count: "exact" });
  if (sp.type && sp.type in CAMPAIGN_TYPE_LABELS) query = query.eq("type", sp.type);
  if (sp.failed) query = query.gt("failed_count", 0);
  const [{ data, count }, { data: groups }] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("groups").select("id, name"),
  ]);
  const campaigns = (data ?? []) as Campaign[];
  const groupNames = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]));

  return (
    <>
      <PageHeader
        title="Message history"
        actions={
          <Button nativeButton={false} render={<Link href="/admin/messages/new" />}>
            New message
          </Button>
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" action="/admin/messages">
        <NativeSelect name="type" defaultValue={sp.type ?? ""} className="w-auto">
          <option value="">All types</option>
          {(Object.keys(CAMPAIGN_TYPE_LABELS) as CampaignType[]).map((t) => (
            <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t]}</option>
          ))}
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="failed" value="1" defaultChecked={!!sp.failed} className="size-4 accent-primary" />
          Only with failures
        </label>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="hidden md:table-cell">To</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent / Failed / Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No messages yet.
                </TableCell>
              </TableRow>
            )}
            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap align-top text-sm">
                  {formatDateTime(c.scheduled_for ?? c.created_at)}
                  <div className="text-xs text-muted-foreground">{CAMPAIGN_TYPE_LABELS[c.type]}</div>
                </TableCell>
                <TableCell className="max-w-xs align-top">
                  <Link href={`/admin/messages/${c.id}`} className="line-clamp-2 whitespace-normal hover:underline">
                    {c.body}
                  </Link>
                </TableCell>
                <TableCell className="hidden align-top text-sm md:table-cell">{describeAudience(c.audience, groupNames)}</TableCell>
                <TableCell className="align-top">
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right align-top text-sm">
                  <span className="text-green-700 dark:text-green-400">{c.sent_count}</span> /{" "}
                  <span className={c.failed_count ? "font-semibold text-destructive" : ""}>{c.failed_count}</span> / {c.recipient_count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/messages", { type: sp.type, failed: sp.failed, page: p })} />
    </>
  );
}
