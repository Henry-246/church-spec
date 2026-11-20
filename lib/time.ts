// Date/time helpers. All times shown to people are Ghana time (Africa/Accra,
// UTC+0, no daylight saving). The database stores UTC.

export const TIME_ZONE = "Africa/Accra";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFormat.format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateFormat.format(new Date(value));
}

/**
 * Converts the value of an <input type="datetime-local"> (e.g. "2026-12-24T18:00"),
 * which the admin types in Ghana time, to a real Date.
 * Ghana is UTC+0 all year, so Ghana local time equals UTC.
 */
export function fromGhanaLocalInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const date = new Date(`${value.length === 16 ? value + ":00" : value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date → "2026-12-24T18:00" in Ghana time (for datetime-local inputs). */
export function toGhanaLocalInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/** "18:00:00" → "18:00" */
export function shortTime(value: string | null | undefined): string {
  return (value ?? "").slice(0, 5);
}

/** Current date in Ghana. */
export function ghanaToday(): { year: number; month: number; day: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}

/** Default value for a "schedule for" input: tomorrow at the given time ("09:00:00"), Ghana time. */
export function tomorrowAtInput(time: string): string {
  const [hh, mm] = shortTime(time).split(":").map(Number);
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  d.setUTCHours(hh || 9, mm || 0, 0, 0);
  return toGhanaLocalInput(d);
}
