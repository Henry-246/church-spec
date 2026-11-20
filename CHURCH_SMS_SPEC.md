# Church Member Registration & SMS System — Build Spec

You (Claude Code) are building this project from scratch. Read this whole file before writing code. Work through the milestones in order, and stop at the end of each milestone to summarise what was done and what I need to do (accounts, keys, dashboard settings).

---

## 1. Goal

Church members and visitors scan a QR code (or open a link), fill in a short form, and their details are saved. Church admins can then send SMS to members: automatically (weekly reminders, birthdays, welcome message) and manually (announcements to everyone or to a group).

Target cost: **₵0 for hosting/database** (free tiers only). The only paid item is SMS credit from Nalo Solutions.

Country: **Ghana**. Timezone: `Africa/Accra` (UTC+0, no daylight saving).

---

## 2. Tech stack (fixed — do not substitute)

| Part | Choice |
|---|---|
| Framework | **Next.js** (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| Hosting | **Cloudflare Workers** using the **OpenNext Cloudflare adapter** (`@opennextjs/cloudflare`). Do not use the deprecated `@cloudflare/next-on-pages`. |
| Database + Auth | **Supabase** (Postgres, Supabase Auth for admin login) |
| Scheduled jobs | **Cloudflare Cron Triggers** on a small separate Worker in the same repo |
| SMS | **Nalo Solutions** SMS API (see section 7) |
| Spam protection | **Cloudflare Turnstile** (free) on the public form |
| Validation | Zod |
| QR codes | `qrcode` npm package |

Use the Supabase JS client (`@supabase/supabase-js`, `@supabase/ssr`). Keep dependencies minimal and Workers-compatible (no Node-only packages on the server path).

---

## 3. Repo structure

```
/
├─ app/                     # Next.js app (public form + admin dashboard + API routes)
├─ lib/
│  ├─ sms/nalo.ts           # ONLY file that talks to Nalo
│  ├─ sms/queue.ts          # enqueue + process outbound SMS
│  ├─ phone.ts              # Ghana phone normalisation
│  ├─ supabase/             # server/browser clients
│  └─ templates.ts          # {first_name} style placeholder rendering
├─ supabase/migrations/     # SQL migrations (schema + RLS)
├─ workers/scheduler/       # tiny Cron Worker that pings the app's job endpoints
├─ wrangler.jsonc           # main app config (OpenNext)
├─ .dev.vars.example
└─ README.md                # setup + deploy steps for a non-expert
```

---

## 4. Features

### 4.1 Public registration form (`/join`)
- Mobile-first, fast, simple. Church name and logo configurable via settings.
- Fields:
  - Full name (required)
  - Phone number (required) — accept `024xxxxxxx`, `+23324xxxxxxx`, `23324xxxxxxx`, with spaces/dashes
  - Gender (optional)
  - Date of birth (day + month required for birthday SMS; year optional)
  - Email (optional)
  - Residential area / location (optional)
  - Status: First-time visitor / Regular visitor / Member
  - Groups/ministries (multi-select from `groups` table, optional)
  - **SMS consent checkbox (required to submit)**: "I agree to receive SMS messages from {church_name}. I can ask to stop at any time."
- Turnstile widget, verified server-side.
- Submission goes through a server action / API route (never write to Supabase directly from the browser).
- If the phone number already exists: update that member's details instead of creating a duplicate, and do not resend the welcome SMS.
- After submit: thank-you page (`/join/thanks`).
- New member → enqueue the **welcome SMS** (template from settings).
- Optional query param `?src=` (e.g. `?src=banner`, `?src=sunday-bulletin`) stored as `source` so we know which QR code people used.

### 4.2 Admin dashboard (`/admin`, login required)
- Login with Supabase Auth (email + password). No public sign-up; admins are invited/created by an existing admin.
- Roles: `admin` (everything) and `editor` (can view members and send messages, cannot manage admins or settings).
- **Members page**: table with search (name/phone), filters (status, group, consent, birthday month), edit, delete, mark opted-out, export CSV, import CSV.
- **Groups page**: create/rename/delete groups (Youth, Choir, Ushers, Women's Fellowship…).
- **Send message page**:
  - Audience: all consented members / one or more groups / status (e.g. first-timers) / a single member.
  - Message box with live character count and SMS segment count (160 chars GSM-7, 153 per segment for multi-part; 70/67 if non-GSM characters are present). Show estimated total SMS units.
  - Placeholders: `{first_name}`, `{full_name}`, `{church_name}`.
  - Preview with a sample member.
  - "Send now" or "Schedule for" date/time.
  - Confirmation dialog showing number of recipients before sending.
- **Recurring reminders page**: create/edit/pause reminders, e.g. "Every Saturday at 18:00 → all members → 'Hi {first_name}, join us tomorrow at 8am…'". Fields: name, message, audience, frequency (weekly on chosen day(s) / monthly on a date / daily), time, active toggle.
- **Birthdays**: toggle + template + send time (default 07:00). Each member receives at most one birthday SMS per year.
- **Message history**: list of sends with status, recipient count, sent/failed counts; drill down to per-recipient results; retry failed.
- **QR codes page**: generate a QR code for `/join` (optionally with `?src=`), download as PNG and SVG, printable A4 poster view.
- **Settings** (admin only): church name, logo URL, Nalo sender ID display, welcome template, birthday template, default send hours.
- Dashboard home: total members, new this week/month, messages sent this month, failed messages.

### 4.3 Opt-out
- Admin can mark a member opted-out; opted-out members are excluded from every send automatically.
- Never send to members with `sms_consent = false` or `opted_out_at` not null.

---

## 5. Database (Supabase / Postgres)

Write these as SQL migrations in `supabase/migrations/`. Use `uuid` primary keys, `timestamptz` columns, sensible indexes.

- `settings` — single row: church_name, logo_url, welcome_template, birthday_template, birthday_enabled, birthday_send_time, etc.
- `profiles` — admin users: id (= auth.users.id), full_name, role (`admin` | `editor`).
- `members` — id, full_name, first_name (derived), phone (unique, normalised `233XXXXXXXXX`), gender, birth_day, birth_month, birth_year, email, location, status, sms_consent, consent_at, opted_out_at, source, notes, created_at, updated_at.
- `groups` — id, name (unique).
- `member_groups` — member_id, group_id (composite PK).
- `campaigns` — one row per "send" (manual, scheduled, recurring run, welcome, birthday): id, type, body, audience (jsonb), scheduled_for, status (`scheduled` | `queued` | `sending` | `done` | `cancelled`), created_by, recipient_count, sent_count, failed_count, created_at.
- `recurring_reminders` — id, name, body, audience (jsonb), frequency, days_of_week int[], day_of_month, send_time, active, last_run_at.
- `outbound_sms` — the send queue/log: id, campaign_id, member_id, phone, body (already personalised), status (`pending` | `sending` | `sent` | `failed`), attempts, provider_message_id, provider_response, error, created_at, sent_at.
- `birthday_log` — member_id, year (unique together) to prevent duplicate birthday messages.

**Security / RLS**
- Enable RLS on every table.
- No `anon` access at all. The public form writes via a server route using the service-role key (server-only env var).
- Authenticated admins/editors can read/write per their role; only `admin` can touch `settings` and `profiles`.
- Never expose the service-role key or Nalo key to the browser.

---

## 6. Sending architecture (important — free-tier limits)

Cloudflare Workers free plan limits subrequests per invocation (roughly 50 — verify the current number in Cloudflare docs) and CPU time. Sending hundreds of SMS one-by-one in a single request will fail. So use a **queue table**:

1. **Enqueue**: when a campaign is sent/started, insert one `outbound_sms` row per recipient (personalised body), status `pending`. Do this with as few DB round-trips as possible (bulk insert / SQL function).
2. **Process**: an endpoint `POST /api/jobs/process-queue` takes up to a small batch (e.g. 25, configurable) of `pending` rows, atomically marks them `sending` (use a Postgres function with `FOR UPDATE SKIP LOCKED`), sends each via Nalo, then marks `sent` / `failed` and updates campaign counters. Failed rows retry up to 3 attempts.
3. **Trigger processing**:
   - Right after "Send now", call the processor once so small sends go out immediately.
   - The scheduler Worker (cron, every minute) calls `process-queue` repeatedly (a capped number of times per run) until the queue is empty or the cap is hit.
4. **Scheduler Worker** (`workers/scheduler`), cron triggers:
   - every minute: `POST /api/jobs/process-queue` (loop), `POST /api/jobs/run-scheduled` (moves due scheduled campaigns + due recurring reminders into the queue).
   - daily at birthday send time: `POST /api/jobs/birthdays`.
   - All job endpoints require header `Authorization: Bearer ${CRON_SECRET}`; reject otherwise.
   - These daily DB reads also keep the Supabase free project from pausing due to inactivity.
5. All jobs must be **idempotent**: a recurring reminder must not fire twice for the same slot (check/update `last_run_at` atomically); birthdays use `birthday_log`.
6. If a message is identical for all recipients (no placeholders), consider using Nalo's multi-recipient sending (if the API supports comma-separated numbers) to save requests — only if confirmed in the docs.

---

## 7. Nalo Solutions SMS API

Official docs (Postman): https://documenter.getpostman.com/view/7705958/Uyr7Hydn

That page renders with JavaScript. Fetch the raw collection JSON instead, which usually works:
`https://documenter.gw.postman.com/api/collections/7705958/Uyr7Hydn?segregateAuth=true&versionTag=latest`

If you cannot fetch it, **stop and ask me to paste the relevant part of the docs**. Do not guess the final contract.

What I believe (verify every detail against the docs before relying on it):
- Base host: `https://sms.nalosolutions.com`
- Sending uses an auth **key** (or username/password) plus a registered **sender ID** (`source` / `sender_id`), destination number in `233XXXXXXXXX` format, and the message text.
- There is a GET-style endpoint (`.../smsbackend/clientapi/Resl_Nalo/send-message/` with params like `key`, `type`, `destination`, `dlr`, `source`, `message`) and a JSON POST variant (fields like `key`, `msisdn`, `message`, `sender_id`).
- Responses may be a plain-text code string (e.g. `1701|...` for success) rather than JSON; other codes mean errors (invalid sender ID, insufficient balance, invalid number, etc.).

Implementation rules:
- Put **all** Nalo code in `lib/sms/nalo.ts`, exposing:
  `sendSms({ to, message }): Promise<{ ok: boolean; providerMessageId?: string; raw: string; error?: string }>`
  and, if the API has one, `getBalance()`.
- Prefer the POST/JSON variant so the key is not in URLs/logs.
- Map Nalo's response codes to clear human messages (shown in the admin message history).
- Add an `SMS_DRY_RUN=true` env mode that logs instead of sending, used in development and tests.
- Store the raw provider response in `outbound_sms.provider_response`.
- If the docs describe delivery reports (DLR callbacks), add an optional `POST /api/webhooks/nalo-dlr` route that updates status — protected by a secret in the callback URL.

---

## 8. Phone number rules (`lib/phone.ts`)
- Strip spaces, dashes, brackets.
- `0XXXXXXXXX` (10 digits) → `233XXXXXXXXX`
- `+233XXXXXXXXX` → `233XXXXXXXXX`
- `233XXXXXXXXX` → unchanged
- Final value must match `^233\d{9}$`; otherwise show a friendly error on the form.
- Unit test this function.

---

## 9. Environment variables

Provide `.dev.vars.example` and document each in README:

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
NALO_API_KEY=                     # server only
NALO_SENDER_ID=
SMS_DRY_RUN=true
CRON_SECRET=                      # shared with scheduler worker
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
APP_URL=                          # scheduler worker: where to call job endpoints
```

Secrets go in Cloudflare via `wrangler secret put`, never committed.

---

## 10. Milestones

1. **Scaffold**: Next.js + Tailwind + shadcn/ui + OpenNext Cloudflare config; deploys a hello page with `wrangler`. README setup section.
2. **Database**: Supabase migrations (tables, indexes, RLS, queue SQL functions), seed `settings` and a few groups. Instructions for creating the first admin user.
3. **Public form**: `/join` + thanks page, Turnstile, validation, phone normalisation, upsert, `?src=` tracking.
4. **Nalo integration**: fetch & read docs, implement `lib/sms/nalo.ts`, dry-run mode, a small admin "Send test SMS to my number" button.
5. **Queue + welcome SMS**: `outbound_sms` processing endpoint, welcome message on new registration.
6. **Admin dashboard**: auth, roles, members (search/filter/edit/CSV), groups, settings, dashboard stats.
7. **Messaging**: compose/preview/segment counter, send now, schedule, history + retry.
8. **Scheduler Worker**: cron triggers, recurring reminders, birthdays, job endpoint auth, idempotency.
9. **QR codes page**: generate/download PNG & SVG, printable poster.
10. **Polish & deploy**: error/loading states, mobile check, final README with step-by-step deploy for a non-developer (Supabase project, Cloudflare account, secrets, custom domain optional, Nalo sender ID approval).

---

## 11. Acceptance checklist
- [ ] Scanning the QR on a phone opens `/join`, form submits in under a few seconds on mobile data.
- [ ] Re-submitting with the same phone updates the record, no duplicate, no second welcome SMS.
- [ ] Form cannot be submitted without consent or valid Ghana number.
- [ ] Browser never receives the service-role key or Nalo key (check the client bundle).
- [ ] Anonymous users cannot read member data through Supabase directly.
- [ ] Sending to 500 members completes via the queue without hitting Worker limits.
- [ ] Opted-out / non-consented members never receive SMS.
- [ ] A weekly reminder fires exactly once per week at the set time.
- [ ] Each member gets at most one birthday SMS per year.
- [ ] Failed SMS show a readable reason and can be retried.
- [ ] `SMS_DRY_RUN=true` sends nothing to Nalo.
- [ ] README lets a non-developer deploy from zero.

---

## 12. Working style
- Ask me before adding any paid service or changing the stack.
- Keep code simple and commented; someone at the church may maintain it later.
- Write unit tests for `phone.ts`, `templates.ts`, SMS segment counting, and the Nalo response parser.
- After each milestone, list exactly what I need to do manually (create accounts, copy keys, run commands).
