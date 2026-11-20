// Input rules (Zod) shared by the public form, admin edit form and CSV import.
import { z } from "zod";
import { normalizeGhanaPhone } from "@/lib/phone";
import { GENDERS, MEMBER_STATUSES } from "@/lib/types";

/** Empty strings from forms become undefined. */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().max(max, `Please keep this under ${max} characters.`).optional());

const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min, message).max(max, message).optional());

export const phoneSchema = z.string().transform((value, ctx) => {
  const result = normalizeGhanaPhone(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.phone;
});

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Fields shared by the public form and the admin member form. */
export const memberFieldsSchema = z
  .object({
    full_name: z.string().trim().min(2, "Please enter your full name.").max(120, "Name is too long."),
    phone: phoneSchema,
    gender: z.preprocess(blankToUndefined, z.enum(GENDERS).optional()),
    birth_day: optionalInt(1, 31, "Please choose a valid day."),
    birth_month: optionalInt(1, 12, "Please choose a valid month."),
    birth_year: optionalInt(1900, new Date().getUTCFullYear(), "Please enter a valid year, e.g. 1990."),
    email: z.preprocess(blankToUndefined, z.string().trim().email("Please enter a valid email address.").max(200).optional()),
    location: optionalText(120),
    status: z.enum(MEMBER_STATUSES, { message: "Please choose one option." }),
    group_ids: z.array(z.string().uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if ((v.birth_day == null) !== (v.birth_month == null)) {
      ctx.addIssue({ code: "custom", path: ["birth_day"], message: "Please choose both the day and the month of your birthday." });
    } else if (v.birth_day != null && v.birth_month != null && v.birth_day > DAYS_IN_MONTH[v.birth_month - 1]) {
      ctx.addIssue({ code: "custom", path: ["birth_day"], message: "That day does not exist in the chosen month." });
    }
  });

export const registrationSchema = memberFieldsSchema.and(
  z.object({
    sms_consent: z.literal(true, { message: "Please tick the box to agree to receive SMS messages." }),
    source: z.preprocess(blankToUndefined, z.string().trim().max(60).optional()),
  }),
);

/** Turns Zod errors into { fieldName: "message" } for showing next to fields. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
