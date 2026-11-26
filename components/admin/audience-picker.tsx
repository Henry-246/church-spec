"use client";

// Choose who receives a message: everyone, groups, statuses or one member.
// Writes the choice as JSON into a hidden input called `name`, and reports the
// live recipient count.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeCheckbox } from "@/components/ui/native-select";
import { formatGhanaPhone } from "@/lib/phone";
import { MEMBER_STATUSES, STATUS_LABELS, type Audience, type MemberStatus } from "@/lib/types";

type Member = { id: string; full_name: string; phone: string };
type Props = {
  name: string;
  groups: { id: string; name: string }[];
  initial?: Audience;
  initialMember?: Member | null;
  allowSingleMember?: boolean;
  onCount?: (count: number | null) => void;
};

export function AudiencePicker({ name, groups, initial, initialMember, allowSingleMember = true, onCount }: Props) {
  const [type, setType] = useState<Audience["type"]>(initial?.type ?? "all");
  const [groupIds, setGroupIds] = useState<string[]>(initial?.type === "groups" ? initial.group_ids : []);
  const [statuses, setStatuses] = useState<MemberStatus[]>(initial?.type === "status" ? initial.statuses : []);
  const [member, setMember] = useState<Member | null>(initialMember ?? null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  // Result of the last count, remembered together with the selection it belongs to.
  const [countResult, setCountResult] = useState<{ key: string; count: number | null; error: boolean } | null>(null);
  const [searchError, setSearchError] = useState(false);

  const audience: Audience | null =
    type === "all"
      ? { type: "all" }
      : type === "groups"
        ? groupIds.length ? { type: "groups", group_ids: groupIds } : null
        : type === "status"
          ? statuses.length ? { type: "status", statuses } : null
          : member ? { type: "members", member_ids: [member.id] } : null;
  const key = JSON.stringify(audience);
  const current = countResult?.key === key ? countResult : null;
  const count = current?.count ?? null;
  const countError = current?.error ?? false;

  // Live recipient count (debounced). Uses a plain API route, so it runs
  // independently of other requests (see app/admin/api/audience-count).
  useEffect(() => {
    const controller = new AbortController();
    onCount?.(null); // until the new number arrives, sending stays disabled
    if (!audience) return () => controller.abort();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/admin/api/audience-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience }),
          signal: controller.signal,
        });
        const data = (await res.json()) as { count?: number };
        if (!res.ok || typeof data.count !== "number") throw new Error("count failed");
        setCountResult({ key, count: data.count, error: false });
        onCount?.(data.count);
      } catch {
        if (!controller.signal.aborted) setCountResult({ key, count: null, error: true });
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the audience
  }, [key]);

  // Member search (debounced).
  useEffect(() => {
    if (type !== "members" || search.trim().length < 2) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/admin/api/member-search?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const data = (await res.json()) as { members?: Member[] };
        if (!res.ok) throw new Error("search failed");
        setSearchError(false);
        setResults(data.members ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [search, type]);

  const toggle = <T,>(list: T[], item: T, on: boolean) => (on ? [...list, item] : list.filter((x) => x !== item));
  const option = (value: Audience["type"], label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" name={`${name}_type`} value={value} checked={type === value} onChange={() => setType(value)} className="size-4 accent-primary" />
      {label}
    </label>
  );

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Send to</legend>
      <input type="hidden" name={name} value={audience ? JSON.stringify(audience) : ""} />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {option("all", "All members")}
        {option("groups", "Groups")}
        {option("status", "Status")}
        {allowSingleMember && option("members", "One member")}
      </div>

      {type === "groups" && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <NativeCheckbox checked={groupIds.includes(g.id)} onChange={(e) => setGroupIds((l) => toggle(l, g.id, e.target.checked))} />
              {g.name}
            </label>
          ))}
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No groups yet.</p>}
        </div>
      )}

      {type === "status" && (
        <div className="flex flex-wrap gap-4 rounded-lg border p-3">
          {MEMBER_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <NativeCheckbox checked={statuses.includes(s)} onChange={(e) => setStatuses((l) => toggle(l, s, e.target.checked))} />
              {STATUS_LABELS[s]}
            </label>
          ))}
        </div>
      )}

      {type === "members" && (
        <div className="grid gap-2 rounded-lg border p-3">
          {member ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>
                <b>{member.full_name}</b> · {formatGhanaPhone(member.phone)}
              </span>
              <button type="button" className="text-xs underline" onClick={() => setMember(null)}>
                Change
              </button>
            </div>
          ) : (
            <>
              <Input placeholder="Type a name or phone number" value={search} onChange={(e) => setSearch(e.target.value)} />
              <ul className="grid gap-1">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setMember(r);
                        setResults([]);
                        setSearch("");
                      }}
                    >
                      {r.full_name} · {formatGhanaPhone(r.phone)}
                    </button>
                  </li>
                ))}
              </ul>
              {searchError && <p className="text-xs text-destructive">Search failed. Check your connection and try again.</p>}
              {!searchError && search.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-muted-foreground">No matching member who can receive SMS.</p>
              )}
              <p className="text-xs text-muted-foreground">Only members who can receive SMS are listed.</p>
            </>
          )}
        </div>
      )}

      <p className="text-sm">
        Recipients:{" "}
        <b>{!audience ? (type === "members" ? "choose a member" : "—") : countError ? "could not count, change the selection to retry" : count === null ? "counting…" : count.toLocaleString()}</b>
        <span className="text-muted-foreground"> (people without SMS consent or who opted out are always left out)</span>
      </p>
    </fieldset>
  );
}
