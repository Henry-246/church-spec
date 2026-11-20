// Message templates with placeholders such as "Hi {first_name}!".
//
// The DATABASE does the real personalisation when messages are queued
// (function public.render_sms in supabase/migrations/..._functions.sql).
// This file must give the SAME result; it is used for previews in the admin.

export const PLACEHOLDERS = ["{first_name}", "{full_name}", "{church_name}"] as const;

export type TemplateValues = {
  first_name?: string | null;
  full_name?: string | null;
  church_name?: string | null;
};

/** The first word of a full name ("Kwame A. Mensah" → "Kwame"). Same rule as the database. */
export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(" ")[0] ?? "";
}

function orFriend(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v === "" ? "Friend" : v;
}

/** Fill in placeholders. Missing names become "Friend"; unknown {words} are left as-is. */
export function renderTemplate(body: string, values: TemplateValues): string {
  return body
    .split("{first_name}").join(orFriend(values.first_name))
    .split("{full_name}").join(orFriend(values.full_name))
    .split("{church_name}").join(values.church_name ?? "");
}

/** Returns true if the text uses any placeholder (i.e. each person gets a different message). */
export function hasPlaceholders(body: string): boolean {
  return PLACEHOLDERS.some((p) => body.includes(p));
}

/** Finds things that look like placeholders but are misspelt, e.g. "{firstname}". */
export function unknownPlaceholders(body: string): string[] {
  const found = body.match(/\{[^{}\s]+\}/g) ?? [];
  return [...new Set(found.filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p)))];
}
