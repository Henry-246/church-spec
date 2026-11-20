// Database tests: runs every SQL file in supabase/migrations inside PGlite
// (a real Postgres compiled to WebAssembly, no install or account needed) and
// checks registration, the SMS queue, reminders, birthdays and security rules.
// Run with:  npm run test:db
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const migDir = process.argv[2] ?? "supabase/migrations";
const db = new PGlite();
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
async function throws(sql, params, re, msg) {
  try { await db.query(sql, params); ok(false, msg + " (no error)"); }
  catch (e) { ok(re.test(e.message), `${msg} → "${e.message}"`); }
}

// ---- Supabase-like environment --------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase's permissive defaults, to prove our migrations lock things down:
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);

for (const f of fs.readdirSync(migDir).sort()) {
  await db.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
  console.log("applied", f);
}
// Seed twice to prove it's re-runnable
await db.exec(fs.readFileSync(path.join(migDir, fs.readdirSync(migDir).sort().at(-1)), "utf8"));
ok((await one("select count(*)::int n from groups")).n === 6, "seed: 6 groups, re-runnable");

// ---- Registration -----------------------------------------------------------
const reg = (p) => one("select register_member($1::jsonb) r", [JSON.stringify(p)]).then((x) => x.r);
const [youth] = await q("select id from groups where name='Youth'");
let r1 = await reg({ full_name: " Kwame Mensah ", phone: "233241234567", status: "regular_visitor",
  email: "k@x.com", birth_day: 5, birth_month: 3, group_ids: [youth.id], source: "banner", sms_consent: true });
ok(r1.is_new === true && r1.welcome_campaign_id, "new member → is_new + welcome campaign");
let w = await q("select body, status from outbound_sms where campaign_id=$1", [r1.welcome_campaign_id]);
ok(w.length === 1 && w[0].body.includes("Kwame!") && w[0].body.includes("Our Church"), `welcome personalised: "${w[0]?.body}"`);
let m = await one("select * from members where phone='233241234567'");
ok(m.first_name === "Kwame" && m.full_name === "Kwame Mensah", "first_name derived, name trimmed");

let r2 = await reg({ full_name: "Kwame A. Mensah", phone: "233241234567", status: "first_time_visitor",
  email: "", source: "bulletin", sms_consent: true });
m = await one("select * from members where phone='233241234567'");
ok(r2.is_new === false && !r2.welcome_campaign_id, "re-register → update, no welcome");
ok((await one("select count(*)::int n from members")).n === 1, "no duplicate member");
ok(m.status === "regular_visitor", "status not downgraded");
ok(m.email === "k@x.com" && m.birth_day === 5, "blank fields don't erase data");
ok(m.source === "banner" && m.full_name === "Kwame A. Mensah", "source kept, name updated");
ok((await one("select count(*)::int n from campaigns where type='welcome'")).n === 1, "only one welcome campaign");
await throws("select register_member($1::jsonb)", [JSON.stringify({ full_name: "X", phone: "0241234567", status: "member", sms_consent: true })], /check constraint|violates/, "un-normalised phone rejected");
await throws("select register_member($1::jsonb)", [JSON.stringify({ full_name: "X", phone: "233200000000", status: "member", sms_consent: false })], /consent/, "no consent rejected");
await throws("select register_member($1::jsonb)", [JSON.stringify({ full_name: "X", phone: "233200000000", status: "member", birth_day: 4, sms_consent: true })], /birthday_pair/, "day without month rejected");

// ---- Bulk campaign + queue ----------------------------------------------------
await db.exec(`insert into members (full_name, phone, status, sms_consent)
  select 'Member ' || g, '23320' || lpad(g::text, 7, '0'), 'member', true from generate_series(1, 499) g;
  insert into members (full_name, phone, status, sms_consent) values ('No Consent', '233559999999', 'member', false);
  insert into members (full_name, phone, status, sms_consent, opted_out_at) values ('Opted Out', '233558888888', 'member', true, now());`);
// drain welcome queue first
let wc = await q("select * from claim_sms_batch(25)");
await q("select complete_sms_batch($1::jsonb)", [JSON.stringify(wc.map((x) => ({ id: x.id, ok: true, provider_message_id: "p1", provider_response: "1701" })))]);
ok((await one("select status, sent_count from campaigns where id=$1", [r1.welcome_campaign_id])).status === "done", "welcome campaign done after send");

ok((await one(`select count_audience('{"type":"all"}') n`)).n === 500, "count_audience all = 500 (excludes no-consent/opted-out)");
ok((await one(`select count_audience($1::jsonb) n`, [JSON.stringify({ type: "groups", group_ids: [youth.id] })])).n === 1, "count_audience groups");
ok((await one(`select count_audience('{"type":"status","statuses":["regular_visitor"]}') n`)).n === 1, "count_audience status");

const camp = await one(`insert into campaigns (type, body, audience) values ('manual','Hi {first_name} ({full_name}) - {church_name}', '{"type":"all"}') returning id`);
ok((await one("select enqueue_campaign($1) n", [camp.id])).n === 500, "enqueue 500");
ok((await one("select enqueue_campaign($1) n", [camp.id])).n === 500, "enqueue again is idempotent");
ok((await one("select count(*)::int n from outbound_sms where campaign_id=$1", [camp.id])).n === 500, "still 500 rows");

// opt someone out after queueing
await q("update members set opted_out_at=now() where phone='233200000001'");
let batch = await q("select * from claim_sms_batch(25)");
ok(batch.length === 25 && batch.every((b) => b.status === "sending" && b.attempts === 1), "claimed 25, marked sending");
ok(!batch.some((b) => b.phone === "233200000001"), "opted-out member not claimed");
ok((await one("select status from outbound_sms where phone='233200000001' and campaign_id=$1", [camp.id])).status === "cancelled", "opted-out row cancelled");
ok((await one("select status from campaigns where id=$1", [camp.id])).status === "sending", "campaign → sending");
const batch2 = await q("select * from claim_sms_batch(25)");
ok(!batch2.some((b) => batch.find((x) => x.id === b.id)), "second claim gets different rows");

const results = batch.map((b, i) => i < 20 ? { id: b.id, ok: true, provider_message_id: "m" + i, provider_response: "1701|x" }
  : i < 23 ? { id: b.id, ok: false, retryable: true, provider_response: "timeout", error: "Network error" }
  : { id: b.id, ok: false, retryable: false, provider_response: "1702", error: "Invalid number" });
await q("select complete_sms_batch($1::jsonb)", [JSON.stringify(results)]);
let c = await one("select * from campaigns where id=$1", [camp.id]);
ok(c.sent_count === 20 && c.failed_count === 2, `counters sent=20 failed=2 (got ${c.sent_count}/${c.failed_count})`);
const retryRow = await one("select * from outbound_sms where id=$1", [batch[20].id]);
ok(retryRow.status === "pending" && new Date(retryRow.next_attempt_at) > new Date(), "retryable → pending with back-off");
ok(retryRow.error === "Network error" && retryRow.provider_response === "timeout", "raw response + error stored");

// exhaust retries on one row
await q("update outbound_sms set next_attempt_at=now() - interval '1 minute', attempts=2 where id=$1", [batch[20].id]);
await q("update outbound_sms set next_attempt_at=now() + interval '1 hour' where campaign_id=$1 and status='pending' and id<>$2", [camp.id, batch[20].id]);
const again = await q("select * from claim_sms_batch(25)");
ok(again.length === 1 && again[0].attempts === 3, "only due row claimed, attempt 3");
await q("select complete_sms_batch($1::jsonb)", [JSON.stringify([{ id: again[0].id, ok: false, retryable: true, error: "Network error" }])]);
ok((await one("select status from outbound_sms where id=$1", [again[0].id])).status === "failed", "3rd failure → failed");

// stuck sending (batch2 never completed) → failed after 10 min
await q("update outbound_sms set locked_at = now() - interval '11 minutes' where id = any($1)", [batch2.map((b) => b.id)]);
await q("select * from claim_sms_batch(0)");
ok((await one("select count(*)::int n from outbound_sms where id = any($1) and status='failed'", [batch2.map((b) => b.id)])).n === 25, "stuck 'sending' → failed (no blind resend)");

// retry failed
const failedBefore = (await one("select failed_count from campaigns where id=$1", [camp.id])).failed_count;
const nRetry = (await one("select retry_failed_sms($1) n", [camp.id])).n;
ok(nRetry === failedBefore, `retry_failed_sms re-queued ${nRetry}/${failedBefore}`);
ok((await one("select failed_count from campaigns where id=$1", [camp.id])).failed_count === 0, "failed_count reset");

// cancel
ok((await one("select cancel_campaign($1) ok", [camp.id])).ok === true, "cancel campaign");
ok((await one("select count(*)::int n from outbound_sms where campaign_id=$1 and status='pending'", [camp.id])).n === 0, "no pending after cancel");
ok((await q("select * from claim_sms_batch(25)")).length === 0, "nothing claimable after cancel");
ok((await one("select retry_failed_sms($1) n", [camp.id])).n === 0, "cannot retry cancelled campaign");

// Drain loop simulation: a full 500 send completes with batches of 25
const camp2 = await one(`insert into campaigns (type, body, audience) values ('manual','Service at 8am', '{"type":"all"}') returning id`);
await q("select enqueue_campaign($1)", [camp2.id]);
let loops = 0;
for (;;) { const b = await q("select * from claim_sms_batch(25)"); if (!b.length) break; loops++;
  await q("select complete_sms_batch($1::jsonb)", [JSON.stringify(b.map((x) => ({ id: x.id, ok: true })))]); }
c = await one("select * from campaigns where id=$1", [camp2.id]);
ok(c.status === "done" && c.sent_count === 499 && loops === 20, `500-audience campaign drained in ${loops} batches → ${c.status}, sent ${c.sent_count}`);

// test SMS to a phone
const t = await one(`insert into campaigns (type, body, audience) values ('test','Test for {first_name}', '{"type":"phone","phone":"233501112222"}') returning id`);
await q("select enqueue_campaign($1)", [t.id]); await q("select enqueue_campaign($1)", [t.id]);
const tr = await q("select body from outbound_sms where campaign_id=$1", [t.id]);
ok(tr.length === 1 && tr[0].body === "Test for Friend", "test SMS: one row, Friend placeholder");

// ---- Scheduled ----------------------------------------------------------------
const s1 = await one(`insert into campaigns (type, body, audience, status, scheduled_for) values ('manual','x','{"type":"all"}','scheduled', now() - interval '1 minute') returning id`);
const s2 = await one(`insert into campaigns (type, body, audience, status, scheduled_for) values ('manual','x','{"type":"all"}','scheduled', now() + interval '1 hour') returning id`);
ok((await one("select enqueue_due_campaigns() n")).n === 1, "only due scheduled campaign enqueued");
ok((await one("select status from campaigns where id=$1", [s1.id])).status === "queued" && (await one("select status from campaigns where id=$1", [s2.id])).status === "scheduled", "statuses correct");
ok((await one("select enqueue_due_campaigns() n")).n === 0, "second run enqueues nothing");
await q("select cancel_campaign($1)", [s1.id]);

// ---- Recurring reminders ------------------------------------------------------
const slot = async (freq, days, dom, time, now) =>
  (await one("select reminder_latest_slot($1, $2::smallint[], $3::smallint, $4::time, $5::timestamptz) s", [freq, days, dom, time, now])).s;
// 2026-11-19 is a Thursday
let s = await slot("weekly", "{6}", null, "18:00", "2026-11-19T10:00:00Z");
ok(s.toISOString() === "2026-11-14T18:00:00.000Z", `weekly Sat 18:00 latest slot = ${s.toISOString()}`);
s = await slot("weekly", "{4}", null, "18:00", "2026-11-19T18:00:00Z");
ok(s.toISOString() === "2026-11-19T18:00:00.000Z", "weekly slot at exactly now included");
s = await slot("daily", "{}", null, "07:00", "2026-11-19T06:59:00Z");
ok(s.toISOString() === "2026-11-18T07:00:00.000Z", "daily before time → yesterday");
s = await slot("monthly", "{}", 31, "09:00", "2026-11-30T10:00:00Z");
ok(s.toISOString() === "2026-11-30T09:00:00.000Z", "monthly 31st → Nov 30 (short month)");
s = await slot("monthly", "{}", 15, "09:00", "2026-11-10T10:00:00Z");
ok(s.toISOString() === "2026-10-15T09:00:00.000Z", "monthly 15th before date → last month");

await db.exec(`insert into recurring_reminders (name, body, audience, frequency, send_time, created_at)
  values ('Daily test', 'Hello {first_name}', '{"type":"status","statuses":["regular_visitor"]}', 'daily',
          ((now() at time zone 'Africa/Accra') - interval '30 minutes')::time, now() - interval '3 days');
  insert into recurring_reminders (name, body, frequency, send_time, created_at)
  values ('Missed', 'late', 'daily', ((now() at time zone 'Africa/Accra') - interval '5 hours')::time, now() - interval '3 days');
  insert into recurring_reminders (name, body, frequency, send_time, active, created_at)
  values ('Paused', 'x', 'daily', ((now() at time zone 'Africa/Accra') - interval '10 minutes')::time, false, now() - interval '3 days');`);
ok((await one("select run_due_reminders() n")).n === 1, "reminder fired once (missed+paused skipped)");
ok((await one("select run_due_reminders() n")).n === 0, "second run: no double fire");
ok((await one("select count(*)::int n from campaigns where type='recurring'")).n === 1, "exactly one recurring campaign");
ok((await one("select last_run_at is not null as x from recurring_reminders where name='Missed'")).x, "missed slot marked handled");
await throws(`insert into campaigns (type, body, audience, recurring_reminder_id, scheduled_for)
  select 'recurring','x','{"type":"all"}', recurring_reminder_id, scheduled_for from campaigns where type='recurring'`, [], /unique/, "unique slot constraint");

// ---- Birthdays ----------------------------------------------------------------
await db.exec(`insert into members (full_name, phone, status, sms_consent, birth_day, birth_month) values
  ('Ama Leap', '233540000001', 'member', true, 29, 2),
  ('Esi Feb28', '233540000002', 'member', true, 28, 2),
  ('Kofi OptOut', '233540000003', 'member', true, 28, 2);
  update members set opted_out_at = now() where phone = '233540000003';`);
ok((await one("select run_birthdays('2027-02-28T06:30:00Z') n")).n === 0, "before send time → 0");
ok((await one("select run_birthdays('2027-02-28T08:00:00Z') n")).n === 2, "Feb 28 2027 (non-leap): Feb28 + Feb29 people, opted-out excluded");
ok((await one("select run_birthdays('2027-02-28T09:00:00Z') n")).n === 0, "second run same day → 0");
ok((await one("select run_birthdays('2028-02-28T08:00:00Z') n")).n === 1, "Feb 28 2028 (leap): only Feb28 person");
ok((await one("select run_birthdays('2028-02-29T08:00:00Z') n")).n === 1, "Feb 29 2028: leap person");
ok((await one("select run_birthdays('2028-03-05T21:30:00Z') n")).n === 0, "after 21:00 → 0");
const bm = await one("select o.body from outbound_sms o join campaigns c on c.id=o.campaign_id where c.type='birthday' and o.phone='233540000001' limit 1");
ok(bm.body.startsWith("Happy birthday, Ama!"), `birthday body: "${bm.body}"`);
await q("update settings set birthday_enabled=false");
ok((await one("select run_birthdays('2028-03-05T08:00:00Z') n")).n === 0, "disabled → 0");

// ---- Security / RLS -------------------------------------------------------------
const admin = await one("insert into auth.users (email) values ('admin@x.com') returning id");
const editor = await one("insert into auth.users (email) values ('ed@x.com') returning id");
const stranger = await one("insert into auth.users (email) values ('nobody@x.com') returning id");
await db.exec(fs.readFileSync(path.join(migDir, "..", "first_admin.sql"), "utf8").replace("you@example.com", "admin@x.com"));
await q("insert into profiles (id, full_name, role) values ($1, 'Ed', 'editor')", [editor.id]);
ok((await one("select role from profiles where id=$1", [admin.id])).role === "admin", "first_admin.sql works");

async function as(role, uid, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  try { return await fn(); } finally { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
}
await as("anon", null, async () => {
  await throws("select * from members", [], /permission denied/, "anon cannot read members");
  await throws("select * from settings", [], /permission denied/, "anon cannot read settings");
  await throws(`insert into members (full_name, phone) values ('x','233200000099')`, [], /permission denied/, "anon cannot insert members");
  await throws(`select register_member('{}'::jsonb)`, [], /permission denied/, "anon cannot call register_member");
  await throws(`select * from claim_sms_batch(1)`, [], /permission denied/, "anon cannot call claim_sms_batch");
});
await as("authenticated", stranger.id, async () => {
  ok((await one("select count(*)::int n from members")).n === 0, "logged-in user without profile sees 0 members");
  ok((await one("select count(*)::int n from settings")).n === 0, "…and no settings");
  await throws(`insert into profiles (id, role) values ($1, 'admin')`, [stranger.id], /row-level security/, "cannot make self admin");
  await throws(`select enqueue_campaign(gen_random_uuid())`, [], /permission denied/, "authenticated cannot call queue functions");
});
await as("authenticated", editor.id, async () => {
  ok((await one("select count(*)::int n from members")).n > 500, "editor reads members");
  await throws(`insert into members (full_name, phone) values ('x','233200000099')`, [], /row-level security/, "editor cannot insert members");
  const upd = await db.query("update settings set church_name='Hacked'");
  ok(upd.affectedRows === 0, "editor cannot update settings");
  ok((await one("select count(*)::int n from profiles")).n === 1, "editor sees only own profile");
  ok((await db.query(`update profiles set role='admin' where id=$1`, [editor.id])).affectedRows === 0, "editor cannot promote self");
  ok((await one("select role from profiles where id=$1", [editor.id])).role === "editor", "editor still editor");
  const ins = await one(`insert into campaigns (type, body, audience) values ('manual','x','{"type":"all"}') returning id`);
  ok(!!ins.id, "editor can create campaign");
  ok((await one("select count(*)::int n from outbound_sms")).n > 0, "editor reads message log");
  ok((await db.query(`update outbound_sms set status='sent'`)).affectedRows === 0, "editor cannot alter message log");
});
await as("authenticated", admin.id, async () => {
  const upd = await db.query("update settings set church_name='Grace Chapel'");
  ok(upd.affectedRows === 1, "admin updates settings");
  const ins = await one(`insert into members (full_name, phone, sms_consent) values ('Admin Added','233270000099', true) returning id`);
  ok(!!ins.id, "admin inserts member");
  ok((await one("select count(*)::int n from profiles")).n === 2, "admin sees all profiles");
});

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
