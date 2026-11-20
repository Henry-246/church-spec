// Shapes of the database rows (see supabase/migrations). Written by hand to
// keep the project simple; update when the schema changes.

export type Role = "admin" | "editor";

export const MEMBER_STATUSES = ["first_time_visitor", "regular_visitor", "member"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const STATUS_LABELS: Record<MemberStatus, string> = {
  first_time_visitor: "First-time visitor",
  regular_visitor: "Regular visitor",
  member: "Member",
};

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type Settings = {
  id: true;
  church_name: string;
  logo_url: string | null;
  sender_id_display: string | null;
  welcome_template: string;
  birthday_template: string;
  birthday_enabled: boolean;
  birthday_send_time: string; // "07:00:00"
  default_send_time: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  created_at: string;
};

export type Member = {
  id: string;
  full_name: string;
  first_name: string;
  phone: string;
  gender: Gender | null;
  birth_day: number | null;
  birth_month: number | null;
  birth_year: number | null;
  email: string | null;
  location: string | null;
  status: MemberStatus;
  sms_consent: boolean;
  consent_at: string | null;
  opted_out_at: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Group = { id: string; name: string; created_at: string };

/** Who receives a message. Mirrors the jsonb shapes in the campaigns table. */
export type Audience =
  | { type: "all" }
  | { type: "groups"; group_ids: string[] }
  | { type: "status"; statuses: MemberStatus[] }
  | { type: "members"; member_ids: string[] }
  | { type: "phone"; phone: string };

export type CampaignType = "manual" | "recurring" | "welcome" | "birthday" | "test";
export type CampaignStatus = "scheduled" | "queued" | "sending" | "done" | "cancelled";
export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  manual: "Announcement",
  recurring: "Reminder",
  welcome: "Welcome",
  birthday: "Birthday",
  test: "Test",
};

export type Campaign = {
  id: string;
  type: CampaignType;
  body: string;
  audience: Audience;
  scheduled_for: string | null;
  status: CampaignStatus;
  recurring_reminder_id: string | null;
  created_by: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

export type OutboundStatus = "pending" | "sending" | "sent" | "failed" | "cancelled";

export type OutboundSms = {
  id: string;
  campaign_id: string;
  member_id: string | null;
  phone: string;
  body: string;
  status: OutboundStatus;
  attempts: number;
  provider_message_id: string | null;
  provider_response: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type Frequency = "daily" | "weekly" | "monthly";

export type RecurringReminder = {
  id: string;
  name: string;
  body: string;
  audience: Audience;
  frequency: Frequency;
  days_of_week: number[];
  day_of_month: number | null;
  send_time: string;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
};
