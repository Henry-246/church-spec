// Ghana phone number helpers.
//
// We store every number in ONE format: 233XXXXXXXXX (12 digits, no "+").
// Accepted input examples (spaces, dashes, dots and brackets are ignored):
//   0241234567      → 233241234567
//   +233241234567   → 233241234567
//   233241234567    → 233241234567
//   00233241234567  → 233241234567
//   +233 (0)24 123 4567 → 233241234567   (common way of writing it)

export const GHANA_PHONE_REGEX = /^233\d{9}$/;

export const PHONE_ERROR_MESSAGE =
  "Please enter a valid Ghana phone number, e.g. 024 123 4567 or +233 24 123 4567.";

export type PhoneResult = { ok: true; phone: string } | { ok: false; error: string };

export function normalizeGhanaPhone(input: string | null | undefined): PhoneResult {
  if (!input) return { ok: false, error: PHONE_ERROR_MESSAGE };

  // Remove spaces, dashes, dots, brackets (and the "(0)" people sometimes add).
  let digits = input.trim().replace(/\(0\)/g, "").replace(/[\s\-.()]/g, "");

  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);

  if (!/^\d+$/.test(digits)) return { ok: false, error: PHONE_ERROR_MESSAGE };

  if (digits.length === 10 && digits.startsWith("0")) {
    digits = "233" + digits.slice(1);
  } else if (digits.length === 13 && digits.startsWith("2330")) {
    // e.g. +233 024 123 4567 (extra 0 after the country code)
    digits = "233" + digits.slice(4);
  }

  return GHANA_PHONE_REGEX.test(digits) ? { ok: true, phone: digits } : { ok: false, error: PHONE_ERROR_MESSAGE };
}

/** 233241234567 → "024 123 4567" (for display). Leaves other values unchanged. */
export function formatGhanaPhone(phone: string): string {
  if (!GHANA_PHONE_REGEX.test(phone)) return phone;
  const local = "0" + phone.slice(3);
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
