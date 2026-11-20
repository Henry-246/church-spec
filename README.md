# Church Registration & SMS

Members and visitors scan a QR code, fill in a short form on their phone, and
their details are saved. Church staff can then send SMS: automatically
(welcome message, birthdays, weekly reminders) and manually (announcements to
everyone, a group, or one person).

| Part | Service | Cost |
|---|---|---|
| Website + scheduled jobs | Cloudflare Workers (free plan) | ₵0 |
| Database + staff logins | Supabase (free plan) | ₵0 |
| Spam protection on the form | Cloudflare Turnstile | ₵0 |
| SMS | Nalo Solutions | SMS credit only |

The original build spec is in [CHURCH_SMS_SPEC.md](CHURCH_SMS_SPEC.md).

**Contents**

1. [How it works (in one minute)](#1-how-it-works-in-one-minute)
2. [What you need](#2-what-you-need)
3. [Set up the database (Supabase)](#3-set-up-the-database-supabase)
4. [Try it on your computer](#4-try-it-on-your-computer)
5. [Put it online (Cloudflare)](#5-put-it-online-cloudflare)
6. [Connect Nalo and go live](#6-connect-nalo-and-go-live)
7. [Using the admin dashboard](#7-using-the-admin-dashboard)
8. [Settings reference (environment variables)](#8-settings-reference-environment-variables)
9. [Maintenance, tests and troubleshooting](#9-maintenance-tests-and-troubleshooting)
10. [Project layout](#10-project-layout)

---

## 1. How it works (in one minute)

- **`/join`**: the public registration form (what the QR code opens). Add
  `?src=banner` (or any word) to know which QR code people used.
- **`/admin`**: the staff dashboard (login required).
- Messages are never sent directly. Each send is saved, then split into one
  queued SMS per person. A small **scheduler worker** wakes up every minute and
  sends the queue in small batches. This keeps everything within Cloudflare's
  free limits, even for hundreds of members.
- People who did not agree to SMS, or who opted out, **never** receive messages.
- **Test mode** (`SMS_DRY_RUN=true`, the default) records everything but sends
  nothing. Switch it off only when you are ready.

## 2. What you need

- A computer with **Node.js 22 LTS** (https://nodejs.org) and **Git**
  (https://git-scm.com). Check with `node -v` (must print v20 or higher).
- Free accounts: **Supabase** (https://supabase.com) and **Cloudflare**
  (https://dash.cloudflare.com/sign-up).
- A **Nalo Solutions** account with SMS credit, an **API key** (from the Nalo
  client portal) **or** your Nalo username + password, and an **approved sender ID** (the name people see, max 11
  characters, e.g. `MYCHURCH`). Sender ID approval can take a few days, so
  request it early.

Open a terminal in this project folder and install the packages once:

```bash
npm install
```

## 3. Set up the database (Supabase)

### 3.1 Create the project

1. At https://supabase.com click **New project**.
2. Choose a name (e.g. `church-sms`), a strong database password (save it in a
   password manager) and the region closest to Ghana (usually **West EU (Ireland)**
   or **Central EU (Frankfurt)**). Plan: **Free**.
3. Wait a minute or two for it to start.

### 3.2 Create the tables (paste the SQL files)

Open **SQL Editor → New query**. Then **one file at a time, in this order**:

| # | File |
|---|---|
| 1 | `supabase/migrations/20261119000001_schema.sql` |
| 2 | `supabase/migrations/20261119000002_security.sql` |
| 3 | `supabase/migrations/20261119000003_functions.sql` |
| 4 | `supabase/migrations/20261119000004_seed.sql` |

For each: open it in your code editor, copy **everything**, paste it into the
SQL Editor (replacing what is there) and click **Run**. Expect "Success. No rows
returned". If Supabase warns about "destructive operations", that is expected
(the files remove public access); click **Run this query**. If you see a red
error, stop and note which file failed.

Check: **Table Editor** should list `members`, `groups` (6 starter groups),
`settings` (1 row), `campaigns`, `outbound_sms` and more.

### 3.3 Turn off public sign-up

**Authentication → Sign In / Providers** → turn **off** "Allow new users to
sign up" → **Save**. (Even if someone signed up, they would see nothing: only
people listed as admins/editors get access.)

### 3.4 Create the first admin

1. **Authentication → Users → Add user → Create new user**: your email, a strong
   password, tick **Auto Confirm User**.
2. Open `supabase/first_admin.sql`, replace `you@example.com` and `Your Name`,
   paste it into the **SQL Editor**, **Run**. It should say 1 row affected (0
   rows = the email does not match exactly).

Other staff are added later from the app (**Admins** page).

### 3.5 Note your keys

**Project Settings → API** (or **API Keys**). You need:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / publishable** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role / secret** key → `SUPABASE_SERVICE_ROLE_KEY` (**full access, keep secret**)

### Who can do what

| | Public | Editor | Admin |
|---|---|---|---|
| Fill in the registration form | ✅ | | |
| View members, groups, message history | ❌ | ✅ | ✅ |
| Send messages, manage reminders | ❌ | ✅ | ✅ |
| Add / edit / delete / import members and groups | ❌ | ❌ | ✅ |
| Settings, birthday settings, admin users | ❌ | ❌ | ✅ |

## 4. Try it on your computer

```bash
cp .dev.vars.example .dev.vars        # Windows PowerShell: Copy-Item .dev.vars.example .dev.vars
```

Open `.dev.vars` and fill in the three Supabase values and a `CRON_SECRET`
(any long random text; generate one with
`node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`). Leave
`SMS_DRY_RUN=true`. The Turnstile values are Cloudflare's test keys and work
locally as they are.

```bash
npm run dev
```

- http://localhost:3000/join: fill in the form.
- http://localhost:3000/admin: log in with your admin email/password.

With `SMS_DRY_RUN=true`, "sent" messages appear in Message history with
"DRY_RUN" and in the terminal, but nothing goes to Nalo.

| Command | What it does |
|---|---|
| `npm run dev` | App at http://localhost:3000 with live reload. |
| `npm run preview` | Builds exactly as Cloudflare runs it, at http://localhost:8787. |
| `npm run deploy` | Builds and uploads the app to Cloudflare. |
| `npm run deploy:scheduler` | Uploads the scheduler worker. |
| `npm test` | Unit + integration tests (phone numbers, SMS counting, Nalo replies, queue). |
| `npm run test:db` | Tests the database SQL in a throw-away local database. |
| `npm run lint` | Checks the code for common mistakes. |

## 5. Put it online (Cloudflare)

### 5.1 Deploy the app

```bash
npx wrangler login        # opens the browser once, click Allow
npm run deploy
```

At the end it prints your address, e.g.
`https://church-sms.<your-subdomain>.workers.dev`. Write it down. (First time
only: Cloudflare may ask you to choose a `workers.dev` subdomain in the
dashboard.)

### 5.2 Create the Turnstile widget (spam protection)

Cloudflare dashboard → **Turnstile → Add widget**. Name: `Church form`.
Hostname: your `….workers.dev` address without `https://` (add your custom
domain too if you have one). Mode: **Managed**. Copy the **Site Key** and
**Secret Key**.

### 5.3 Upload the settings (secrets)

```bash
cp production.secrets.example production.secrets   # PowerShell: Copy-Item production.secrets.example production.secrets
```

Fill in `production.secrets` (your app address from 5.1, Supabase keys from
3.5, Nalo key and sender ID, a **new** long random `CRON_SECRET`, Turnstile
keys from 5.2), then:

```bash
npx wrangler secret bulk production.secrets
```

Secrets take effect immediately; no re-deploy needed. To change one later:
`npx wrangler secret put NAME`. **Never commit or share `production.secrets`**
(git ignores it; you can delete it after uploading).

Open `https://…workers.dev/join`: the form should show your church name.

### 5.4 Deploy the scheduler (timed sending)

```bash
npm run deploy:scheduler
npx wrangler secret put CRON_SECRET --config workers/scheduler/wrangler.jsonc
```

Paste **the same** `CRON_SECRET` as in `production.secrets`. The scheduler
runs every minute: it sends queued SMS, scheduled messages, reminders and
birthdays. (It talks to the app directly through a Cloudflare "service
binding", so its `APP_URL` placeholder does not need changing.)

Check: Cloudflare dashboard → **Workers & Pages → church-sms-scheduler → Logs**
should show a run every minute with status 200 results.

### 5.5 Custom domain (optional)

If your church domain uses Cloudflare DNS: **Workers & Pages → church-sms →
Settings → Domains & Routes → Add → Custom domain** (e.g. `join.mychurch.org`).
Then update `NEXT_PUBLIC_SITE_URL` (`npx wrangler secret put
NEXT_PUBLIC_SITE_URL`) and add the domain to the Turnstile widget. Make new QR
codes afterwards.

> **Deploying from Windows:** the Cloudflare adapter warns it is "not fully
> compatible with Windows". It builds and deploys fine in our tests. If the live
> site ever shows strange errors that `npm run dev` does not, deploy from WSL
> (Windows Subsystem for Linux) or connect the GitHub repository in Cloudflare
> (**Workers & Pages → church-sms → Settings → Builds**, build command
> `npx opennextjs-cloudflare build`, deploy command `npx opennextjs-cloudflare deploy`).

## 6. Connect Nalo and go live

1. Confirm with Nalo that your **sender ID is approved**. The app sends to
   `https://sms.nalosolutions.com/smsbackend/Resl_Nalo/send-message/` (Nalo's
   JSON API, already used successfully by other Nalo integrations). Only if Nalo
   gives you a different address, set it with `npx wrangler secret put NALO_API_URL`.
2. Still in test mode, log in → **Settings → Send a test SMS** → it should show
   "sent" with "DRY_RUN".
3. Go live: in `wrangler.jsonc` change `"SMS_DRY_RUN": "true"` to `"false"`,
   then `npm run deploy`. The yellow "Test mode" bar in the admin disappears.
4. **Settings → Send a test SMS** to your own phone. If it fails, the reason is
   shown (e.g. "sender ID is invalid or not yet approved", "not enough SMS
   credit").

Nalo's API has no balance check: watch your credit on the Nalo portal.

## 7. Using the admin dashboard

- **Settings** (admins): church name, logo, welcome SMS text, test SMS.
- **QR codes**: type where it will be used (e.g. `banner`), download PNG/SVG or
  print the A4 poster. Test-scan before printing.
- **Members**: search, filter (status, group, SMS status, birthday month),
  edit, mark opted out, export/import CSV. Re-registering with the same phone
  updates the person (no duplicate, no second welcome SMS).
- **Send message**: choose the audience, type the message (placeholders
  `{first_name}`, `{full_name}`, `{church_name}`), check the live SMS count,
  send now or schedule. A confirmation shows the number of recipients and
  estimated SMS units.
  - 1 SMS = 160 standard characters (153 each when longer). Emoji or curly
    quotes switch to 70 characters per SMS, which costs more; the box warns you.
- **Message history**: progress and per-person results with readable failure
  reasons, **Retry** failed ones, **Cancel** scheduled ones.
- **Reminders**: e.g. every Saturday 18:00 → all members. Each slot is sent
  once; if the system was down for more than 2 hours, that slot is skipped
  (never sent late).
- **Birthdays**: on/off, message and time (default 07:00). One birthday SMS per
  person per year; 29 February birthdays are greeted on 28 February in other
  years. Birthday SMS go out between the set time and 21:00.
- **Admins**: add editors/admins (a temporary password is shown once), change
  roles, reset passwords, remove access.
- **Opt-out**: if someone asks to stop, open them in Members → **Mark opted out**.

## 8. Settings reference (environment variables)

All settings are read **when the app runs** (not at build time). Locally they
come from `.dev.vars`; on Cloudflare from secrets (`production.secrets` /
`wrangler secret put`) and `vars` in `wrangler.jsonc`.

| Name | Secret? | What it is |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | no | Public address, e.g. `https://church-sms.xyz.workers.dev` (QR codes). |
| `NEXT_PUBLIC_SUPABASE_URL` | no | Supabase Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Supabase anon/publishable key. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase service-role key. Server only. |
| `NALO_API_KEY` | **yes** | Nalo API key. Server only. Leave empty to use username/password instead. |
| `NALO_USERNAME` | **yes** | Nalo username (only used if `NALO_API_KEY` is empty). |
| `NALO_PASSWORD` | **yes** | Nalo password (only used if `NALO_API_KEY` is empty). |
| `NALO_SENDER_ID` | no | Approved sender ID (max 11 characters). |
| `NALO_API_URL` | no | Optional. Nalo endpoint if different from the default (see section 6). |
| `SMS_DRY_RUN` | no | `true` = send nothing (default). `false` = real SMS. Set in `wrangler.jsonc`. |
| `CRON_SECRET` | **yes** | Long random password shared by the app and the scheduler worker. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no | Turnstile site key. |
| `TURNSTILE_SECRET_KEY` | **yes** | Turnstile secret key. |
| `QUEUE_BATCH_SIZE` | no | Optional. SMS per queue run (default 20, max 40). |
| `APP_URL` | no | Scheduler only. Base address of the app (placeholder is fine with the service binding). |
| `MAX_QUEUE_CALLS` | no | Scheduler only. Queue runs per minute (default 10 ≈ 200 SMS/minute). |

The `NEXT_PUBLIC_` values are not secret; the server passes them to the
browser where needed. The service-role key, Nalo key, Turnstile secret and
`CRON_SECRET` never reach the browser.

## 9. Maintenance, tests and troubleshooting

**Changing the database later**: never edit a migration that has already been
run. Add a new file in `supabase/migrations/` with a later date, run
`npm run test:db`, then paste only the new file into the SQL Editor.

**Tests**: `npm test` (phone numbers, templates, SMS segments, Nalo replies, and
the queue with a fake Nalo against the real SQL) and `npm run test:db`.

**Job endpoints** (used by the scheduler; all need
`Authorization: Bearer <CRON_SECRET>`):
`POST /api/jobs/process-queue`, `POST /api/jobs/run-scheduled`,
`POST /api/jobs/birthdays`. To trigger the scheduler by hand:
`curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://church-sms-scheduler.<subdomain>.workers.dev/run`.

**Troubleshooting**

| Problem | What to check |
|---|---|
| `/join` says "temporarily unavailable" | Supabase secrets missing/wrong, or the SQL files not run. Cloudflare → church-sms → Logs shows the exact message. |
| Admin page "could not be loaded" | Same as above. |
| Messages stay "queued"/"waiting" | Scheduler not deployed, or its `CRON_SECRET` differs from the app's. Check church-sms-scheduler Logs (401 = secret mismatch). The **Refresh / send next batch** button on a message sends one batch by hand. |
| Every SMS fails with a Nalo reason | Read the reason in Message history: sender ID not approved, no credit, wrong key/username/password, wrong `NALO_API_URL`. Fix, then **Retry all failed**. |
| "Unrecognised reply from Nalo" | Probably a wrong `NALO_API_URL`. The raw reply is under "Nalo response". These are not retried automatically (they may have been sent). |
| Form says "complete the security check" | Turnstile keys wrong, or the site's hostname is not in the Turnstile widget. |
| Supabase project "paused" | Free projects pause after a week without activity. The scheduler touches the database every minute, which prevents this while it runs. |
| Cloudflare "Error 1102" (CPU limit) | The free plan allows 10 ms CPU per request. If this happens often, Workers Paid ($5/month) removes the problem. This is a paid change; decide first. |
| `npm test` fails with "reading 'config'" | Run it via `npm test` (not `npx vitest`), which fixes a Windows drive-letter quirk. |

## 10. Project layout

```
app/join/                 Public registration form + thank-you page
app/admin/                Staff dashboard (login, members, messages, …)
app/api/jobs/             Endpoints the scheduler calls (queue, scheduled, birthdays)
components/               UI pieces (components/ui = shadcn/ui)
lib/sms/nalo.ts           The ONLY file that talks to Nalo
lib/sms/nalo-response.ts  Understands Nalo replies and error codes
lib/sms/queue.ts          Queueing and sending in batches
lib/sms/segments.ts       SMS length / units calculator
lib/phone.ts              Ghana phone number clean-up (233XXXXXXXXX)
lib/templates.ts          {first_name} placeholders
lib/env.ts                Reads settings (environment variables)
middleware.ts             Keeps admin logins fresh
supabase/migrations/      Database tables, security rules, queue functions
supabase/first_admin.sql  One-off script to make the first admin
workers/scheduler/        The every-minute scheduler worker
tests/                    Automated tests
wrangler.jsonc            Cloudflare settings for the app
```
