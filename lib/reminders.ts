// Recurring reminder helpers (display only; the database decides when to send,
// see reminder_latest_slot in supabase/migrations/..._functions.sql).
import { WEEKDAYS, type Frequency } from "@/lib/types";

type Schedule = { frequency: Frequency; days_of_week: number[]; day_of_month: number | null; send_time: string };

function matches(s: Schedule, d: Date): boolean {
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return s.days_of_week.includes(d.getUTCDay());
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(s.day_of_month ?? 1, lastDay);
}

/** Next time this reminder will be sent (Ghana time = UTC). */
export function nextRun(s: Schedule, now = new Date()): Date | null {
  const [h, m] = s.send_time.split(":").map(Number);
  for (let i = 0; i <= 62; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, h, m));
    if (d > now && matches(s, d)) return d;
  }
  return null;
}

/** "Every Saturday at 18:00", "Every day at 07:00", "Monthly on day 1 at 09:00". */
export function describeSchedule(s: Schedule): string {
  const time = s.send_time.slice(0, 5);
  if (s.frequency === "daily") return `Every day at ${time}`;
  if (s.frequency === "weekly") {
    const days = [...s.days_of_week].sort().map((d) => WEEKDAYS[d]);
    return `Every ${days.join(", ")} at ${time}`;
  }
  return `Monthly on day ${s.day_of_month}${(s.day_of_month ?? 0) > 28 ? " (or the last day)" : ""} at ${time}`;
}
