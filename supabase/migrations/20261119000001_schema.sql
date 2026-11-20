-- =============================================================================
-- 1/4  SCHEMA: tables, constraints, indexes
-- Paste into Supabase → SQL Editor → New query → Run.
-- =============================================================================
-- Conventions:
--   * uuid primary keys, timestamptz for all times (stored in UTC).
--   * Ghana time (Africa/Accra) is UTC+0 with no daylight saving; local-time
--     calculations still use the 'Africa/Accra' zone explicitly for clarity.
--   * Status columns are text + CHECK constraints (easy to read and change).

-- Keeps updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- settings: exactly ONE row (id is always true).
-- -----------------------------------------------------------------------------
create table public.settings (
  id                 boolean primary key default true check (id),
  church_name        text not null default 'Our Church',
  logo_url           text,
  sender_id_display  text,                 -- shown in the UI only; the real sender ID is the NALO_SENDER_ID env var
  welcome_template   text not null default 'Welcome to {church_name}, {first_name}! We are glad you joined us. God bless you.',
  birthday_template  text not null default 'Happy birthday, {first_name}! Everyone at {church_name} is celebrating you today. God bless you.',
  birthday_enabled   boolean not null default true,
  birthday_send_time time not null default '07:00',
  -- Default time suggested when scheduling a message (admin can change per message).
  default_send_time  time not null default '09:00',
  updated_at         timestamptz not null default now()
);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profiles: admin users (one per Supabase Auth user who may use /admin).
-- -----------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- members: people who registered (or were imported).
-- -----------------------------------------------------------------------------
create table public.members (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(trim(full_name)) > 0),
  -- First word of the full name, kept in sync automatically.
  first_name   text generated always as (split_part(trim(full_name), ' ', 1)) stored,
  phone        text not null unique check (phone ~ '^233[0-9]{9}$'),   -- normalised, e.g. 233241234567
  gender       text check (gender in ('male', 'female')),
  birth_day    smallint check (birth_day between 1 and 31),
  birth_month  smallint check (birth_month between 1 and 12),
  birth_year   smallint check (birth_year between 1900 and 2100),
  email        text,
  location     text,
  status       text not null default 'first_time_visitor'
                 check (status in ('first_time_visitor', 'regular_visitor', 'member')),
  sms_consent  boolean not null default false,
  consent_at   timestamptz,
  opted_out_at timestamptz,               -- set = never send SMS to this person
  source       text,                      -- which QR code / link they used (?src=)
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Day and month must be given together (needed for birthday SMS).
  constraint members_birthday_pair check ((birth_day is null) = (birth_month is null))
);

create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

create index members_status_idx     on public.members (status);
create index members_birthday_idx   on public.members (birth_month, birth_day);
create index members_created_at_idx on public.members (created_at desc);
create index members_full_name_idx  on public.members (lower(full_name));

-- -----------------------------------------------------------------------------
-- groups / ministries and membership.
-- -----------------------------------------------------------------------------
create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.member_groups (
  member_id uuid not null references public.members (id) on delete cascade,
  group_id  uuid not null references public.groups (id) on delete cascade,
  primary key (member_id, group_id)
);

create index member_groups_group_idx on public.member_groups (group_id);

-- -----------------------------------------------------------------------------
-- recurring_reminders: e.g. "every Saturday 18:00 → all members".
-- -----------------------------------------------------------------------------
create table public.recurring_reminders (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  body         text not null,
  audience     jsonb not null default '{"type":"all"}'::jsonb,
  frequency    text not null check (frequency in ('daily', 'weekly', 'monthly')),
  days_of_week smallint[] not null default '{}',   -- weekly: 0 = Sunday … 6 = Saturday
  day_of_month smallint check (day_of_month between 1 and 31),  -- monthly (31 = last day in short months)
  send_time    time not null,                      -- Ghana local time
  active       boolean not null default true,
  -- Start time of the last slot that was handled. Prevents double sending.
  last_run_at  timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reminders_weekly_days  check (frequency <> 'weekly'  or cardinality(days_of_week) > 0),
  constraint reminders_monthly_day  check (frequency <> 'monthly' or day_of_month is not null),
  constraint reminders_days_range   check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[])
);

create trigger recurring_reminders_updated_at before update on public.recurring_reminders
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- campaigns: one row per "send" (manual, recurring run, welcome, birthday, test).
-- audience (jsonb) shapes:
--   {"type":"all"}
--   {"type":"groups",   "group_ids":  ["uuid", ...]}
--   {"type":"status",   "statuses":   ["first_time_visitor", ...]}
--   {"type":"members",  "member_ids": ["uuid", ...]}
--   {"type":"phone",    "phone": "233XXXXXXXXX"}   -- test SMS to an admin's own number
-- -----------------------------------------------------------------------------
create table public.campaigns (
  id                    uuid primary key default gen_random_uuid(),
  type                  text not null check (type in ('manual', 'recurring', 'welcome', 'birthday', 'test')),
  body                  text not null check (length(body) > 0),
  audience              jsonb not null,
  scheduled_for         timestamptz,       -- when it should go out (null = immediately)
  status                text not null default 'queued'
                          check (status in ('scheduled', 'queued', 'sending', 'done', 'cancelled')),
  recurring_reminder_id uuid references public.recurring_reminders (id) on delete set null,
  created_by            uuid references public.profiles (id) on delete set null,
  recipient_count       integer not null default 0,
  sent_count            integer not null default 0,
  failed_count          integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- A recurring reminder can only create ONE campaign per time slot.
  constraint campaigns_reminder_slot_unique unique (recurring_reminder_id, scheduled_for)
);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

create index campaigns_due_idx        on public.campaigns (scheduled_for) where status = 'scheduled';
create index campaigns_created_at_idx on public.campaigns (created_at desc);

-- -----------------------------------------------------------------------------
-- outbound_sms: the send queue AND the log of every SMS.
-- -----------------------------------------------------------------------------
create table public.outbound_sms (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns (id) on delete cascade,
  member_id           uuid references public.members (id) on delete set null,
  phone               text not null,
  body                text not null,          -- already personalised
  status              text not null default 'pending'
                        check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts            smallint not null default 0,
  next_attempt_at     timestamptz not null default now(),   -- for retry back-off
  locked_at           timestamptz,                          -- when it was picked up for sending
  provider_message_id text,
  provider_response   text,                   -- raw Nalo response
  error               text,                   -- readable reason when failed
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  -- Never queue the same member twice in one campaign.
  constraint outbound_sms_campaign_member_unique unique (campaign_id, member_id)
);

create trigger outbound_sms_updated_at before update on public.outbound_sms
  for each row execute function public.set_updated_at();

create index outbound_sms_pending_idx  on public.outbound_sms (next_attempt_at) where status = 'pending';
create index outbound_sms_sending_idx  on public.outbound_sms (locked_at)       where status = 'sending';
create index outbound_sms_campaign_idx on public.outbound_sms (campaign_id, status);
create index outbound_sms_member_idx   on public.outbound_sms (member_id);
create index outbound_sms_provider_idx on public.outbound_sms (provider_message_id) where provider_message_id is not null;

-- -----------------------------------------------------------------------------
-- birthday_log: guarantees at most one birthday SMS per member per year.
-- -----------------------------------------------------------------------------
create table public.birthday_log (
  member_id  uuid not null references public.members (id) on delete cascade,
  year       smallint not null,
  created_at timestamptz not null default now(),
  primary key (member_id, year)
);
