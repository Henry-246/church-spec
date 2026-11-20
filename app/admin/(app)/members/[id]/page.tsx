// One member: details, edit form, opt-out, delete, and their SMS history.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/time";
import type { Member, OutboundSms } from "@/lib/types";
import { Notice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/form-bits";
import { Button } from "@/components/ui/button";
import { MemberForm } from "../member-form";
import { deleteMemberAction, setOptOutAction } from "../actions";

export const metadata = { title: "Member" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const { saved } = await searchParams;
  const staff = await requireStaff();
  const isAdmin = staff.profile.role === "admin";
  const supabase = await createClient();

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: member }, { data: groups }, { data: links }, { data: messages }] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).maybeSingle<Member>(),
    supabase.from("groups").select("id, name").order("name"),
    supabase.from("member_groups").select("group_id").eq("member_id", id),
    supabase.from("outbound_sms").select("id, campaign_id, body, status, error, created_at, sent_at").eq("member_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!member) notFound();

  return (
    <>
      <PageHeader
        title={member.full_name}
        description={`Registered ${formatDateTime(member.created_at)}${member.source ? ` · source: ${member.source}` : ""}`}
        actions={
          !member.opted_out_at && member.sms_consent ? (
            <Button variant="outline" nativeButton={false} render={<Link href={`/admin/messages/new?member=${member.id}`} />}>
              Send SMS
            </Button>
          ) : undefined
        }
      />
      {saved && <Notice kind="success">Member saved.</Notice>}
      {member.opted_out_at && (
        <Notice kind="warning">Opted out of SMS on {formatDateTime(member.opted_out_at)}. They will not receive any messages.</Notice>
      )}
      {!member.sms_consent && <Notice kind="warning">No SMS consent recorded. They will not receive any messages.</Notice>}

      <MemberForm member={member} memberGroupIds={(links ?? []).map((l) => l.group_id)} groups={groups ?? []} readOnly={!isAdmin} />

      {isAdmin && (
        <div className="mt-8 flex flex-wrap gap-2 border-t pt-6">
          <form action={setOptOutAction}>
            <input type="hidden" name="id" value={member.id} />
            <input type="hidden" name="opt_out" value={member.opted_out_at ? "0" : "1"} />
            <ConfirmButton
              variant="outline"
              confirmText={member.opted_out_at ? "Allow SMS to this member again? Only do this if they asked." : "Mark as opted out? They will receive no more SMS."}
            >
              {member.opted_out_at ? "Undo opt-out" : "Mark opted out"}
            </ConfirmButton>
          </form>
          <form action={deleteMemberAction}>
            <input type="hidden" name="id" value={member.id} />
            <ConfirmButton variant="destructive" confirmText={`Delete ${member.full_name} permanently? This cannot be undone.`}>
              Delete member
            </ConfirmButton>
          </form>
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Recent SMS</h2>
      {messages?.length ? (
        <ul className="grid gap-2">
          {(messages as OutboundSms[]).map((m) => (
            <li key={m.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={m.status} />
                <span className="text-muted-foreground">{formatDateTime(m.sent_at ?? m.created_at)}</span>
                <Link href={`/admin/messages/${m.campaign_id}`} className="ml-auto text-xs hover:underline">
                  View send →
                </Link>
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.error && <p className="mt-1 text-xs text-destructive">{m.error}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      )}
    </>
  );
}
