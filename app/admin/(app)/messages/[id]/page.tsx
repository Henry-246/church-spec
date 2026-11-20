// One send: progress, per-recipient results, retry failed, cancel.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import { formatGhanaPhone } from "@/lib/phone";
import { describeAudience } from "@/lib/audience";
import { CAMPAIGN_TYPE_LABELS, type Campaign, type OutboundSms } from "@/lib/types";
import { Notice, PageHeader, Pager, StatusBadge, withParams } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/form-bits";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cancelCampaignAction, retryFailedAction, sendNextBatchAction } from "../actions";

export const metadata = { title: "Message details" };
const PAGE_SIZE = 100;

type Search = { status?: string; page?: string; created?: string; retried?: string };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  await requireStaff();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  let rowsQuery = supabase.from("outbound_sms").select("*, members(full_name)", { count: "exact" }).eq("campaign_id", id);
  if (sp.status) rowsQuery = rowsQuery.eq("status", sp.status);

  const [{ data: campaign }, { data: rowsData, count }, { data: groups }] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", id).maybeSingle<Campaign>(),
    rowsQuery.order("status").order("created_at").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("groups").select("id, name"),
  ]);
  if (!campaign) notFound();
  const rows = (rowsData ?? []) as (OutboundSms & { members: { full_name: string } | null })[];
  const groupNames = Object.fromEntries((groups ?? []).map((g) => [g.id, g.name]));
  const inProgress = campaign.status === "queued" || campaign.status === "sending";
  const pendingCount = campaign.recipient_count - campaign.sent_count - campaign.failed_count;

  return (
    <>
      <PageHeader
        title={`${CAMPAIGN_TYPE_LABELS[campaign.type]} message`}
        description={`Created ${formatDateTime(campaign.created_at)} · ${describeAudience(campaign.audience, groupNames)}`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/admin/messages" />}>
            ← History
          </Button>
        }
      />
      {sp.created && campaign.status === "scheduled" && <Notice kind="success">Scheduled. It will be sent at {formatDateTime(campaign.scheduled_for)}.</Notice>}
      {sp.created && campaign.status !== "scheduled" && <Notice kind="success">Message queued. Sending has started; this page shows progress.</Notice>}
      {sp.retried && <Notice kind="success">Failed messages were queued again.</Notice>}

      <div className="mb-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <p className="mb-2 whitespace-pre-wrap">{campaign.body}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={campaign.status} />
            {campaign.scheduled_for && <span>Scheduled for {formatDateTime(campaign.scheduled_for)}</span>}
            <span>
              {campaign.recipient_count} recipients · <span className="text-green-700 dark:text-green-400">{campaign.sent_count} sent</span> ·{" "}
              <span className={campaign.failed_count ? "text-destructive" : ""}>{campaign.failed_count} failed</span>
              {pendingCount > 0 && inProgress ? ` · ${pendingCount} waiting` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {inProgress && (
            <form action={sendNextBatchAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <SubmitButton variant="outline" pendingText="Sending…">
                Refresh / send next batch
              </SubmitButton>
            </form>
          )}
          {campaign.failed_count > 0 && campaign.status !== "cancelled" && (
            <form action={retryFailedAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <ConfirmButton confirmText={`Retry ${campaign.failed_count} failed message(s)? Make sure the reason (e.g. no credit) is fixed first.`}>
                Retry all failed
              </ConfirmButton>
            </form>
          )}
          {(campaign.status === "scheduled" || inProgress) && (
            <form action={cancelCampaignAction}>
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <ConfirmButton variant="destructive" confirmText="Cancel this message? Messages not yet sent will not go out.">
                Cancel
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      {campaign.status !== "scheduled" && (
        <>
          <form className="mb-3 flex gap-2" action={`/admin/messages/${campaign.id}`}>
            <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-auto">
              <option value="">All recipients</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="pending">Waiting</option>
              <option value="sending">Sending</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
            <Button type="submit" variant="outline">Filter</Button>
          </form>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Time</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Nothing here.</TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="align-top">
                      {r.member_id ? (
                        <Link href={`/admin/members/${r.member_id}`} className="hover:underline">
                          {r.members?.full_name ?? "(deleted member)"}
                        </Link>
                      ) : (
                        "Test"
                      )}
                      <div className="text-xs text-muted-foreground">{formatGhanaPhone(r.phone)}</div>
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusBadge status={r.status} />
                      {r.attempts > 1 && <div className="text-xs text-muted-foreground">{r.attempts} attempts</div>}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap align-top text-sm md:table-cell">{formatDateTime(r.sent_at ?? r.created_at)}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal align-top text-xs">
                      {r.error && <p className="text-destructive">{r.error}</p>}
                      {r.provider_response && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">Nalo response</summary>
                          <code className="break-all">{r.provider_response}</code>
                        </details>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      {r.status === "failed" && campaign.status !== "cancelled" && (
                        <form action={retryFailedAction}>
                          <input type="hidden" name="campaign_id" value={campaign.id} />
                          <input type="hidden" name="sms_id" value={r.id} />
                          <SubmitButton size="sm" variant="outline" pendingText="…">
                            Retry
                          </SubmitButton>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams(`/admin/messages/${campaign.id}`, { status: sp.status, page: p })} />
        </>
      )}
    </>
  );
}
