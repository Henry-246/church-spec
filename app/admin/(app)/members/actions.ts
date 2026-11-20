"use server";

// Member changes (admins only; the database also enforces this with RLS).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, memberFieldsSchema } from "@/lib/validation";
import { parseCsvObjects } from "@/lib/csv";
import { normalizeGhanaPhone } from "@/lib/phone";
import { GENDERS, MEMBER_STATUSES, MONTHS, type MemberStatus } from "@/lib/types";

export type MemberFormState = { errors: Record<string, string>; saved?: boolean };

const adminMemberSchema = memberFieldsSchema.and(
  z.object({
    notes: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(2000).optional()),
    sms_consent: z.boolean(),
  }),
);

export async function saveMemberAction(_prev: MemberFormState, formData: FormData): Promise<MemberFormState> {
  await requireAdmin();
  const id = (formData.get("id") as string) || null;

  const parsed = adminMemberSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    gender: formData.get("gender"),
    birth_day: formData.get("birth_day"),
    birth_month: formData.get("birth_month"),
    birth_year: formData.get("birth_year"),
    email: formData.get("email"),
    location: formData.get("location"),
    status: formData.get("status"),
    group_ids: formData.getAll("group_ids"),
    notes: formData.get("notes"),
    sms_consent: formData.get("sms_consent") === "on",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { group_ids, ...v } = parsed.data;
  const supabase = await createClient();

  const row = {
    full_name: v.full_name,
    phone: v.phone,
    gender: v.gender ?? null,
    birth_day: v.birth_day ?? null,
    birth_month: v.birth_month ?? null,
    birth_year: v.birth_year ?? null,
    email: v.email ?? null,
    location: v.location ?? null,
    status: v.status,
    notes: v.notes ?? null,
    sms_consent: v.sms_consent,
  };

  let memberId = id;
  if (id) {
    const { data: existing } = await supabase.from("members").select("sms_consent, consent_at").eq("id", id).single();
    const consent_at = v.sms_consent ? (existing?.sms_consent ? existing.consent_at : new Date().toISOString()) : existing?.consent_at ?? null;
    const { error } = await supabase.from("members").update({ ...row, consent_at }).eq("id", id);
    if (error) return { errors: { form: friendlyDbError(error) } };
  } else {
    const { data, error } = await supabase
      .from("members")
      .insert({ ...row, consent_at: v.sms_consent ? new Date().toISOString() : null, source: "admin" })
      .select("id")
      .single();
    if (error) return { errors: { form: friendlyDbError(error) } };
    memberId = data.id;
  }

  // Replace group memberships with the ticked ones.
  await supabase.from("member_groups").delete().eq("member_id", memberId!);
  if (group_ids.length) {
    const { error } = await supabase.from("member_groups").insert(group_ids.map((group_id) => ({ member_id: memberId!, group_id })));
    if (error) return { errors: { form: `Saved, but groups could not be updated: ${error.message}` } };
  }

  revalidatePath("/admin/members");
  if (!id) redirect(`/admin/members/${memberId}?saved=1`);
  return { errors: {}, saved: true };
}

function friendlyDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Another member already has this phone number.";
  if (error.code === "42501") return "You do not have permission to do this.";
  return `Could not save: ${error.message}`;
}

export async function deleteMemberAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/members");
  redirect("/admin/members?deleted=1");
}

export async function setOptOutAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const optOut = formData.get("opt_out") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ opted_out_at: optOut ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/members/${id}`);
  revalidatePath("/admin/members");
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------
export type ImportState = { done?: boolean; created?: number; updated?: number; skipped?: { line: number; reason: string }[]; error?: string };

const STATUS_WORDS: Record<string, MemberStatus> = {
  member: "member",
  regular: "regular_visitor",
  regular_visitor: "regular_visitor",
  "regular visitor": "regular_visitor",
  first_time_visitor: "first_time_visitor",
  "first-time visitor": "first_time_visitor",
  "first time visitor": "first_time_visitor",
  "first-time": "first_time_visitor",
  visitor: "first_time_visitor",
};

const yes = (v: string) => /^(y|yes|true|1|x)$/i.test(v.trim());

export async function importMembersAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const text = String(formData.get("csv") ?? "");
  const assumeConsent = formData.get("assume_consent") === "on";
  if (!text.trim()) return { error: "Please choose a CSV file." };
  if (text.length > 2_000_000) return { error: "File is too large (max ~2 MB). Split it into smaller files." };

  const { headers, rows } = parseCsvObjects(text);
  const nameCol = headers.find((h) => ["full_name", "name", "fullname"].includes(h));
  const phoneCol = headers.find((h) => ["phone", "phone_number", "mobile", "telephone", "number"].includes(h));
  if (!nameCol || !phoneCol) return { error: 'The first row must contain column names, including "full_name" (or "name") and "phone".' };

  const supabase = await createClient();
  const skipped: { line: number; reason: string }[] = [];
  const records = new Map<string, Record<string, unknown> & { phone: string; _groups: string[] }>();

  rows.forEach((r, i) => {
    const line = i + 2; // +1 header, +1 human counting
    const name = r[nameCol]?.trim();
    const phone = normalizeGhanaPhone(r[phoneCol]);
    if (!name) return skipped.push({ line, reason: "Missing name" });
    if (!phone.ok) return skipped.push({ line, reason: `Invalid phone "${r[phoneCol]}"` });

    const rec: Record<string, unknown> & { phone: string; _groups: string[] } = { full_name: name, phone: phone.phone, _groups: [] };
    const gender = r.gender?.toLowerCase();
    if (gender && (GENDERS as readonly string[]).includes(gender)) rec.gender = gender;
    else if (gender === "m") rec.gender = "male";
    else if (gender === "f") rec.gender = "female";

    const day = Number(r.birth_day);
    let month = Number(r.birth_month);
    if (!month && r.birth_month) month = MONTHS.findIndex((m) => m.toLowerCase().startsWith(r.birth_month.toLowerCase().slice(0, 3))) + 1;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      rec.birth_day = day;
      rec.birth_month = month;
    }
    const year = Number(r.birth_year);
    if (year >= 1900 && year <= new Date().getUTCFullYear()) rec.birth_year = year;
    if (r.email) rec.email = r.email;
    if (r.location) rec.location = r.location;
    if (r.notes) rec.notes = r.notes;
    const status = STATUS_WORDS[(r.status ?? "").toLowerCase()];
    if (status) rec.status = status;
    else if ((MEMBER_STATUSES as readonly string[]).includes(r.status)) rec.status = r.status;
    if (r.source) rec.source = r.source;
    if ("sms_consent" in r && r.sms_consent !== "") rec.sms_consent = yes(r.sms_consent);
    else if (assumeConsent) rec.sms_consent = true;
    if (r.groups) rec._groups = r.groups.split(/[;|]/).map((g) => g.trim()).filter(Boolean);
    records.set(phone.phone, rec); // later rows with the same phone win
  });

  if (records.size === 0) return { done: true, created: 0, updated: 0, skipped };

  // Existing members (to update instead of duplicate, and keep their data).
  const phones = [...records.keys()];
  const existing = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < phones.length; i += 300) {
    const { data, error } = await supabase.from("members").select("*").in("phone", phones.slice(i, i + 300));
    if (error) return { error: error.message };
    data.forEach((m) => existing.set(m.phone, m));
  }

  const now = new Date().toISOString();
  const upserts = [...records.values()].map(({ _groups, ...rec }) => {
    const old = existing.get(rec.phone) as Record<string, unknown> | undefined;
    const merged: Record<string, unknown> = {
      full_name: rec.full_name,
      phone: rec.phone,
      gender: rec.gender ?? old?.gender ?? null,
      birth_day: rec.birth_day ?? old?.birth_day ?? null,
      birth_month: rec.birth_month ?? old?.birth_month ?? null,
      birth_year: rec.birth_year ?? old?.birth_year ?? null,
      email: rec.email ?? old?.email ?? null,
      location: rec.location ?? old?.location ?? null,
      notes: rec.notes ?? old?.notes ?? null,
      status: rec.status ?? old?.status ?? "member",
      source: old?.source ?? rec.source ?? "import",
      sms_consent: rec.sms_consent ?? old?.sms_consent ?? false,
    };
    merged.consent_at = merged.sms_consent ? (old?.consent_at ?? now) : (old?.consent_at ?? null);
    return { merged, groups: _groups };
  });

  // Groups named in the file (created if missing).
  const groupNames = [...new Set(upserts.flatMap((u) => u.groups))];
  const groupIds = new Map<string, string>();
  if (groupNames.length) {
    const { data: allGroups } = await supabase.from("groups").select("id, name");
    allGroups?.forEach((g) => groupIds.set(g.name.toLowerCase(), g.id));
    const missing = groupNames.filter((n) => !groupIds.has(n.toLowerCase()));
    if (missing.length) {
      const { data: created } = await supabase.from("groups").insert(missing.map((name) => ({ name }))).select("id, name");
      created?.forEach((g) => groupIds.set(g.name.toLowerCase(), g.id));
    }
  }

  const idByPhone = new Map<string, string>();
  for (let i = 0; i < upserts.length; i += 300) {
    const chunk = upserts.slice(i, i + 300).map((u) => u.merged);
    const { data, error } = await supabase.from("members").upsert(chunk, { onConflict: "phone" }).select("id, phone");
    if (error) return { error: `Import stopped: ${error.message}. Rows before this point were saved.` };
    data.forEach((m) => idByPhone.set(m.phone, m.id));
  }

  const links = upserts.flatMap((u) =>
    u.groups
      .map((name) => groupIds.get(name.toLowerCase()))
      .filter((gid): gid is string => !!gid)
      .map((group_id) => ({ member_id: idByPhone.get(u.merged.phone as string)!, group_id })),
  );
  for (let i = 0; i < links.length; i += 500) {
    await supabase.from("member_groups").upsert(links.slice(i, i + 500), { onConflict: "member_id,group_id", ignoreDuplicates: true });
  }

  revalidatePath("/admin/members");
  const updated = upserts.filter((u) => existing.has(u.merged.phone as string)).length;
  return { done: true, created: upserts.length - updated, updated, skipped };
}
