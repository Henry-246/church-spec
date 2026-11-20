// Members list with search and filters.
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatGhanaPhone } from "@/lib/phone";
import { formatDate } from "@/lib/time";
import { MEMBER_STATUSES, MONTHS, STATUS_LABELS, type Member } from "@/lib/types";
import { Notice, PageHeader, Pager, withParams } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Members" };
const PAGE_SIZE = 50;

type Search = { q?: string; status?: string; group?: string; consent?: string; month?: string; page?: string; sort?: string; deleted?: string };

export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  const isAdmin = staff.profile.role === "admin";
  const supabase = await createClient();
  const page = Math.max(1, Number(sp.page) || 1);

  const { data: groups } = await supabase.from("groups").select("id, name").order("name");

  // Join member_groups (inner join only when filtering by a group).
  let query = supabase
    .from("members")
    .select(sp.group ? "*, member_groups!inner(group_id)" : "*", { count: "exact" });

  if (sp.q) {
    // Remove characters that have special meaning in the search syntax.
    const text = sp.q.replace(/[,()*%\\"']/g, " ").trim();
    const digits = text.replace(/\D/g, "").replace(/^0+/, "");
    const parts = [`full_name.ilike.%${text}%`];
    if (digits.length >= 3) parts.push(`phone.like.%${digits}%`);
    if (text) query = query.or(parts.join(","));
  }
  if (sp.status && (MEMBER_STATUSES as readonly string[]).includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.group) query = query.eq("member_groups.group_id", sp.group);
  if (sp.consent === "yes") query = query.eq("sms_consent", true).is("opted_out_at", null);
  if (sp.consent === "no") query = query.eq("sms_consent", false);
  if (sp.consent === "opted_out") query = query.not("opted_out_at", "is", null);
  if (sp.month && Number(sp.month) >= 1 && Number(sp.month) <= 12) query = query.eq("birth_month", Number(sp.month)).order("birth_day");

  query = sp.sort === "name" ? query.order("full_name") : query.order("created_at", { ascending: false });
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const members = (data ?? []) as unknown as Member[];

  const filters = { q: sp.q, status: sp.status, group: sp.group, consent: sp.consent, month: sp.month, sort: sp.sort };

  return (
    <>
      <PageHeader
        title="Members"
        description={`${count ?? 0} matching`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<a href={withParams("/admin/members/export", filters)} />}>
              Export CSV
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" nativeButton={false} render={<Link href="/admin/members/import" />}>
                  Import CSV
                </Button>
                <Button nativeButton={false} render={<Link href="/admin/members/new" />}>
                  Add member
                </Button>
              </>
            )}
          </>
        }
      />
      {sp.deleted && <Notice kind="success">Member deleted.</Notice>}
      {error && <Notice kind="error">Could not load members: {error.message}</Notice>}

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" action="/admin/members">
        <Input name="q" placeholder="Search name or phone" defaultValue={sp.q} className="lg:col-span-2" />
        <NativeSelect name="status" defaultValue={sp.status ?? ""}>
          <option value="">All statuses</option>
          {MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </NativeSelect>
        <NativeSelect name="group" defaultValue={sp.group ?? ""}>
          <option value="">All groups</option>
          {groups?.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect name="consent" defaultValue={sp.consent ?? ""}>
          <option value="">Any SMS status</option>
          <option value="yes">Can receive SMS</option>
          <option value="no">No consent</option>
          <option value="opted_out">Opted out</option>
        </NativeSelect>
        <NativeSelect name="month" defaultValue={sp.month ?? ""}>
          <option value="">Any birthday month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </NativeSelect>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit">Search</Button>
          <Button variant="ghost" nativeButton={false} render={<Link href="/admin/members" />}>
            Clear
          </Button>
        </div>
      </form>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="hidden md:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Birthday</TableHead>
              <TableHead className="hidden sm:table-cell">SMS</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No members found.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/admin/members/${m.id}`} className="font-medium hover:underline">
                    {m.full_name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatGhanaPhone(m.phone)}</TableCell>
                <TableCell className="hidden md:table-cell">{STATUS_LABELS[m.status]}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {m.birth_day && m.birth_month ? `${m.birth_day} ${MONTHS[m.birth_month - 1].slice(0, 3)}` : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {m.opted_out_at ? (
                    <Badge variant="destructive">Opted out</Badge>
                  ) : m.sms_consent ? (
                    <Badge variant="secondary">Yes</Badge>
                  ) : (
                    <Badge variant="outline">No consent</Badge>
                  )}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap lg:table-cell">{formatDate(m.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/members", { ...filters, page: p })} />
    </>
  );
}
