-- =============================================================================
-- 3/4  FUNCTIONS: registration, SMS queue, scheduled jobs
-- =============================================================================
-- All functions here are called ONLY by the app server (service-role key).
-- At the bottom, execute rights are removed from everyone else, so they cannot
-- be called from a browser even by logged-in users.
--
-- The queue in short:
--   1. enqueue_campaign()    → one outbound_sms row per recipient ('pending').
--   2. claim_sms_batch()     → picks a small batch, marks it 'sending'
--                               (FOR UPDATE SKIP LOCKED = safe if two runs overlap).
--   3. app sends each SMS via Nalo.
--   4. complete_sms_batch()  → marks 'sent' / retry later / 'failed', updates counters.

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Fills in {first_name}, {full_name}, {church_name}.
-- Must behave the same as lib/templates.ts (used for previews).
-- Missing names (e.g. a test SMS to a phone number) become "Friend".
create or replace function public.render_sms(
  p_body text, p_full_name text, p_first_name text, p_church_name text
) returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(p_body,
    '{first_name}',  coalesce(nullif(trim(p_first_name), ''), 'Friend')),
    '{full_name}',   coalesce(nullif(trim(p_full_name), ''), 'Friend')),
    '{church_name}', coalesce(p_church_name, ''));
$$;

-- Members who match an audience AND may receive SMS (consented, not opted out).
-- See the campaigns table comment (migration 1) for audience shapes.
create or replace function public.audience_member_ids(p_audience jsonb)
returns setof uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := p_audience->>'type';
begin
  if v_type is null or v_type not in ('all', 'groups', 'status', 'members') then
    raise exception 'Unknown audience type: %', coalesce(v_type, '(none)');
  end if;

  return query
  select m.id
  from public.members m
  where m.sms_consent
    and m.opted_out_at is null
    and case v_type
      when 'all' then true
      when 'groups' then exists (
        select 1 from public.member_groups mg
        where mg.member_id = m.id
          and mg.group_id in (select (jsonb_array_elements_text(coalesce(p_audience->'group_ids', '[]'::jsonb)))::uuid))
      when 'status' then m.status in (
        select jsonb_array_elements_text(coalesce(p_audience->'statuses', '[]'::jsonb)))
      when 'members' then m.id in (
        select (jsonb_array_elements_text(coalesce(p_audience->'member_ids', '[]'::jsonb)))::uuid)
    end;
end;
$$;

-- Number of recipients for an audience (shown in the "confirm send" dialog).
create or replace function public.count_audience(p_audience jsonb)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_audience->>'type' = 'phone' then 1
              else (select count(*)::int from public.audience_member_ids(p_audience)) end;
$$;

-- Recomputes sent/failed counters; marks a campaign 'done' when nothing is left to send.
create or replace function public.refresh_campaign_counts(p_campaign_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.campaigns c set
    sent_count   = s.sent,
    failed_count = s.failed,
    status = case when c.status in ('queued', 'sending') and s.open = 0 then 'done' else c.status end
  from (
    select campaign_id,
           count(*) filter (where status = 'sent')                  as sent,
           count(*) filter (where status = 'failed')                as failed,
           count(*) filter (where status in ('pending', 'sending')) as open
    from public.outbound_sms
    where campaign_id = any(p_campaign_ids)
    group by campaign_id
  ) s
  where c.id = s.campaign_id;
$$;

-- -----------------------------------------------------------------------------
-- 1. Enqueue: turn a campaign into personalised outbound_sms rows.
--    Safe to call more than once (duplicates are ignored).
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_campaign(p_campaign_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  c        public.campaigns;
  v_church text;
  v_count  integer;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign % not found', p_campaign_id;
  end if;

  -- Already being sent, finished or cancelled: nothing to do.
  if c.status not in ('scheduled', 'queued') then
    return c.recipient_count;
  end if;

  select church_name into v_church from public.settings where id;

  if c.audience->>'type' = 'phone' then
    -- Single test SMS to a phone number (not a member).
    if coalesce(c.audience->>'phone', '') !~ '^233[0-9]{9}$' then
      raise exception 'Invalid phone in audience: %', c.audience->>'phone';
    end if;
    insert into public.outbound_sms (campaign_id, member_id, phone, body)
    select c.id, null, c.audience->>'phone', public.render_sms(c.body, null, null, v_church)
    where not exists (select 1 from public.outbound_sms where campaign_id = c.id);
  else
    insert into public.outbound_sms (campaign_id, member_id, phone, body)
    select c.id, m.id, m.phone, public.render_sms(c.body, m.full_name, m.first_name, v_church)
    from public.members m
    where m.id in (select public.audience_member_ids(c.audience))
    on conflict (campaign_id, member_id) do nothing;
  end if;

  select count(*) into v_count from public.outbound_sms where campaign_id = c.id;

  update public.campaigns
  set recipient_count = v_count,
      status = case when v_count = 0 then 'done' else 'queued' end
  where id = c.id;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Claim a batch of SMS to send now.
-- -----------------------------------------------------------------------------
create or replace function public.claim_sms_batch(p_limit integer default 25)
returns setof public.outbound_sms
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  -- a) SMS stuck in 'sending' for 10+ minutes (the app crashed mid-send).
  --    We cannot know whether Nalo sent it, so mark failed instead of
  --    re-sending automatically. An admin can retry from Message history.
  with stuck as (
    update public.outbound_sms
    set status = 'failed', locked_at = null,
        error = 'Sending was interrupted; this SMS may or may not have been delivered. Check before retrying.'
    where status = 'sending' and locked_at < now() - interval '10 minutes'
    returning campaign_id
  )
  select array_agg(distinct campaign_id) into v_ids from stuck;

  -- b) Members who opted out (or withdrew consent) after being queued: never send.
  with skipped as (
    update public.outbound_sms o
    set status = 'cancelled', error = 'Member has opted out of SMS'
    from public.members m
    where o.member_id = m.id
      and o.status = 'pending'
      and (m.opted_out_at is not null or not m.sms_consent)
    returning o.campaign_id
  )
  select array_agg(distinct campaign_id) into v_ids
  from (select unnest(v_ids) as campaign_id union select campaign_id from skipped) x;

  if v_ids is not null then
    perform public.refresh_campaign_counts(v_ids);
  end if;

  -- c) Claim the next batch.
  return query
  with picked as (
    select o.id
    from public.outbound_sms o
    join public.campaigns c on c.id = o.campaign_id
    where o.status = 'pending'
      and o.next_attempt_at <= now()
      and c.status in ('queued', 'sending')
    order by o.next_attempt_at, o.created_at
    limit greatest(p_limit, 0)
    for update of o skip locked
  )
  update public.outbound_sms o
  set status = 'sending', attempts = o.attempts + 1, locked_at = now()
  from picked
  where o.id = picked.id
  returning o.*;

  update public.campaigns c
  set status = 'sending'
  where c.status = 'queued'
    and exists (select 1 from public.outbound_sms o where o.campaign_id = c.id and o.status = 'sending');
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Record the results of a batch in ONE call (saves Worker subrequests).
--    p_results: [{"id":..., "ok":true|false, "retryable":true|false,
--                 "provider_message_id":..., "provider_response":..., "error":...}, ...]
--    Retryable failures are tried again (up to 3 attempts in total) after a
--    short wait; other failures (e.g. invalid number) fail immediately.
-- -----------------------------------------------------------------------------
create or replace function public.complete_sms_batch(p_results jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with r as (
    select * from jsonb_to_recordset(p_results) as x(
      id uuid, ok boolean, retryable boolean,
      provider_message_id text, provider_response text, error text)
  ),
  upd as (
    update public.outbound_sms o
    set status = case
          when r.ok then 'sent'
          when coalesce(r.retryable, false) and o.attempts < 3 then 'pending'
          else 'failed' end,
        sent_at             = case when r.ok then now() end,
        next_attempt_at     = case when r.ok then o.next_attempt_at
                                   else now() + make_interval(mins => 2 * o.attempts) end,
        provider_message_id = r.provider_message_id,
        provider_response   = r.provider_response,
        error               = case when r.ok then null else r.error end,
        locked_at           = null
    from r
    where o.id = r.id and o.status = 'sending'
    returning o.campaign_id
  )
  select array_agg(distinct campaign_id) into v_ids from upd;

  if v_ids is not null then
    perform public.refresh_campaign_counts(v_ids);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Retry failed SMS of a campaign (all, or only the given ids).
-- Opted-out members are not retried.
-- -----------------------------------------------------------------------------
create or replace function public.retry_failed_sms(p_campaign_id uuid, p_sms_ids uuid[] default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from public.campaigns where id = p_campaign_id and status <> 'cancelled' for update;
  if not found then
    return 0;
  end if;

  update public.outbound_sms o
  set status = 'pending', attempts = 0, error = null, next_attempt_at = now(), locked_at = null
  where o.campaign_id = p_campaign_id
    and o.status = 'failed'
    and (p_sms_ids is null or o.id = any(p_sms_ids))
    and (o.member_id is null or exists (
      select 1 from public.members m
      where m.id = o.member_id and m.sms_consent and m.opted_out_at is null));
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.campaigns set status = 'queued' where id = p_campaign_id and status = 'done';
    perform public.refresh_campaign_counts(array[p_campaign_id]);
  end if;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancel a scheduled or in-progress campaign. Already-sent SMS are unaffected.
-- -----------------------------------------------------------------------------
create or replace function public.cancel_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.campaigns set status = 'cancelled'
  where id = p_campaign_id and status in ('scheduled', 'queued', 'sending');
  if not found then
    return false;
  end if;

  update public.outbound_sms set status = 'cancelled', error = 'Campaign cancelled'
  where campaign_id = p_campaign_id and status = 'pending';

  perform public.refresh_campaign_counts(array[p_campaign_id]);
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Scheduled campaigns whose time has come → queue.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_due_campaigns()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  for v_id in
    select id from public.campaigns
    where status = 'scheduled' and scheduled_for <= now()
    order by scheduled_for
    for update skip locked
  loop
    perform public.enqueue_campaign(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recurring reminders
-- -----------------------------------------------------------------------------

-- The most recent time slot (<= p_now) at which a reminder should have fired,
-- in Ghana time. Looks back up to 31 days. Monthly reminders on the 29th–31st
-- fire on the last day of shorter months.
create or replace function public.reminder_latest_slot(
  p_frequency text, p_days_of_week smallint[], p_day_of_month smallint,
  p_send_time time, p_now timestamptz
) returns timestamptz
language sql
stable
set search_path = ''
as $$
  select max((d::date + p_send_time) at time zone 'Africa/Accra')
  from generate_series(
         (p_now at time zone 'Africa/Accra')::date - 31,
         (p_now at time zone 'Africa/Accra')::date,
         interval '1 day') as d
  where ((d::date + p_send_time) at time zone 'Africa/Accra') <= p_now
    and case p_frequency
      when 'daily'   then true
      when 'weekly'  then extract(dow from d)::smallint = any(p_days_of_week)
      when 'monthly' then extract(day from d)::int = least(
                            p_day_of_month::int,
                            extract(day from date_trunc('month', d) + interval '1 month - 1 day')::int)
      else false
    end;
$$;

-- Fires every reminder whose latest slot has not been handled yet.
-- Exactly-once per slot is guaranteed by:
--   * row locks (two overlapping runs cannot handle the same reminder), and
--   * last_run_at (a slot is handled once), and
--   * the unique (recurring_reminder_id, scheduled_for) constraint on campaigns.
-- If a slot is more than p_grace late (e.g. the scheduler was down), it is
-- skipped rather than sent late ("join us tomorrow" arriving a day late is wrong).
-- NOTE for the app: when a reminder is created, edited or re-activated, set
-- last_run_at = now() so that a slot earlier today is not sent immediately.
create or replace function public.run_due_reminders(p_grace interval default interval '2 hours')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r          public.recurring_reminders;
  v_slot     timestamptz;
  v_campaign uuid;
  v_count    integer := 0;
begin
  for r in
    select * from public.recurring_reminders where active for update skip locked
  loop
    v_slot := public.reminder_latest_slot(r.frequency, r.days_of_week, r.day_of_month, r.send_time, now());

    continue when v_slot is null;
    continue when v_slot < r.created_at;
    continue when r.last_run_at is not null and r.last_run_at >= v_slot;

    update public.recurring_reminders set last_run_at = v_slot where id = r.id;

    continue when now() - v_slot > p_grace;   -- missed slot: skip, don't send late

    insert into public.campaigns (type, body, audience, scheduled_for, status, recurring_reminder_id, created_by)
    values ('recurring', r.body, r.audience, v_slot, 'queued', r.id, r.created_by)
    on conflict (recurring_reminder_id, scheduled_for) do nothing
    returning id into v_campaign;

    if v_campaign is not null then
      perform public.enqueue_campaign(v_campaign);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Birthdays: safe to call many times a day. Sends only after the configured
-- send time and before 21:00 Ghana time, at most once per member per year.
-- People born on 29 February are greeted on 28 February in non-leap years.
-- -----------------------------------------------------------------------------
create or replace function public.run_birthdays(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  s          public.settings;
  v_local    timestamp := p_now at time zone 'Africa/Accra';
  v_today    date      := (p_now at time zone 'Africa/Accra')::date;
  v_year     smallint  := extract(year from v_today)::smallint;
  v_month    smallint  := extract(month from v_today)::smallint;
  v_day      smallint  := extract(day from v_today)::smallint;
  v_leap     boolean   := extract(day from make_date(v_year, 3, 1) - 1) = 29;
  v_ids      uuid[];
  v_campaign uuid;
begin
  select * into s from public.settings where id;
  if not found or not s.birthday_enabled
     or v_local::time < s.birthday_send_time
     or v_local::time >= time '21:00' then
    return 0;
  end if;

  with eligible as (
    select m.id
    from public.members m
    where m.sms_consent
      and m.opted_out_at is null
      and (   (m.birth_month = v_month and m.birth_day = v_day)
           or (not v_leap and v_month = 2 and v_day = 28 and m.birth_month = 2 and m.birth_day = 29))
  ),
  logged as (
    insert into public.birthday_log (member_id, year)
    select id, v_year from eligible
    on conflict (member_id, year) do nothing
    returning member_id
  )
  select array_agg(member_id) into v_ids from logged;

  if v_ids is null then
    return 0;
  end if;

  insert into public.campaigns (type, body, audience, scheduled_for, status)
  values ('birthday', s.birthday_template,
          jsonb_build_object('type', 'members', 'member_ids', to_jsonb(v_ids)),
          p_now, 'queued')
  returning id into v_campaign;

  perform public.enqueue_campaign(v_campaign);
  return cardinality(v_ids);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public registration form: create or update a member in ONE call.
-- p: {full_name, phone, gender?, birth_day?, birth_month?, birth_year?, email?,
--     location?, status, group_ids?: [uuid], source?, sms_consent: true}
-- Rules:
--   * Same phone = same person: update instead of creating a duplicate.
--   * Blank optional fields never erase saved details.
--   * Status is never downgraded (a Member stays a Member).
--   * Groups are added, never removed (admins manage removals).
--   * The original ?src= is kept.
--   * An opted-out member stays opted out (only an admin can undo that).
--   * Welcome SMS only for brand-new members.
-- Returns {member_id, is_new, welcome_campaign_id}.
-- -----------------------------------------------------------------------------
create or replace function public.status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status when 'first_time_visitor' then 1 when 'regular_visitor' then 2 when 'member' then 3 else 0 end;
$$;

create or replace function public.register_member(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id       uuid;
  v_new      boolean;
  v_template text;
  v_campaign uuid;
begin
  if coalesce((p->>'sms_consent')::boolean, false) is not true then
    raise exception 'SMS consent is required';
  end if;

  insert into public.members as m (
    full_name, phone, gender, birth_day, birth_month, birth_year,
    email, location, status, sms_consent, consent_at, source)
  values (
    trim(p->>'full_name'),
    p->>'phone',
    nullif(p->>'gender', ''),
    nullif(p->>'birth_day', '')::smallint,
    nullif(p->>'birth_month', '')::smallint,
    nullif(p->>'birth_year', '')::smallint,
    nullif(trim(p->>'email'), ''),
    nullif(trim(p->>'location'), ''),
    coalesce(nullif(p->>'status', ''), 'first_time_visitor'),
    true,
    now(),
    nullif(trim(p->>'source'), ''))
  on conflict (phone) do update set
    full_name   = excluded.full_name,
    gender      = coalesce(excluded.gender, m.gender),
    birth_day   = coalesce(excluded.birth_day, m.birth_day),
    birth_month = coalesce(excluded.birth_month, m.birth_month),
    birth_year  = coalesce(excluded.birth_year, m.birth_year),
    email       = coalesce(excluded.email, m.email),
    location    = coalesce(excluded.location, m.location),
    status      = case when public.status_rank(excluded.status) >= public.status_rank(m.status)
                       then excluded.status else m.status end,
    sms_consent = true,
    consent_at  = case when m.sms_consent then m.consent_at else now() end,
    source      = coalesce(m.source, excluded.source)
  returning m.id, (m.xmax = 0) into v_id, v_new;   -- xmax = 0 means "inserted, not updated"

  insert into public.member_groups (member_id, group_id)
  select v_id, g.id
  from public.groups g
  where g.id in (select (jsonb_array_elements_text(coalesce(p->'group_ids', '[]'::jsonb)))::uuid)
  on conflict do nothing;

  if v_new then
    select welcome_template into v_template from public.settings where id;
    if coalesce(trim(v_template), '') <> '' then
      insert into public.campaigns (type, body, audience, status)
      values ('welcome', v_template, jsonb_build_object('type', 'members', 'member_ids', jsonb_build_array(v_id)), 'queued')
      returning id into v_campaign;
      perform public.enqueue_campaign(v_campaign);
    end if;
  end if;

  return jsonb_build_object('member_id', v_id, 'is_new', v_new, 'welcome_campaign_id', v_campaign);
end;
$$;

-- -----------------------------------------------------------------------------
-- Lock down: only the server (service_role) may call these functions.
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.render_sms(text, text, text, text)',
    'public.audience_member_ids(jsonb)',
    'public.count_audience(jsonb)',
    'public.refresh_campaign_counts(uuid[])',
    'public.enqueue_campaign(uuid)',
    'public.claim_sms_batch(integer)',
    'public.complete_sms_batch(jsonb)',
    'public.retry_failed_sms(uuid, uuid[])',
    'public.cancel_campaign(uuid)',
    'public.enqueue_due_campaigns()',
    'public.reminder_latest_slot(text, smallint[], smallint, time, timestamptz)',
    'public.run_due_reminders(interval)',
    'public.run_birthdays(timestamptz)',
    'public.status_rank(text)',
    'public.register_member(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
