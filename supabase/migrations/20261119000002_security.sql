-- =============================================================================
-- 2/4  SECURITY: Row Level Security (RLS) and permissions
-- =============================================================================
-- Who can do what:
--   anon (anyone on the internet)   → NOTHING. The public form saves through
--                                     the server, which uses the service-role key.
--   editor (logged-in staff)        → read members/groups/history,
--                                     create & manage messages and reminders.
--   admin  (logged-in staff)        → everything, incl. settings and admin users.
--   service_role (server only)      → bypasses RLS; used by the app server and jobs.
-- Logged-in users WITHOUT a row in `profiles` get no access at all.

-- -----------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so they can read `profiles` from inside
-- policies without recursion. They only ever return a role/boolean.
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'editor'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

revoke all on function public.current_app_role() from public, anon;
revoke all on function public.is_staff()         from public, anon;
revoke all on function public.is_admin()         from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_staff()         to authenticated, service_role;
grant execute on function public.is_admin()         to authenticated, service_role;

-- set_updated_at is a trigger helper only.
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges: anon gets nothing; authenticated is limited by RLS below.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;

-- New tables created later should not be readable by anon automatically.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- -----------------------------------------------------------------------------
-- Enable RLS on every table.
-- -----------------------------------------------------------------------------
alter table public.settings            enable row level security;
alter table public.profiles            enable row level security;
alter table public.members             enable row level security;
alter table public.groups              enable row level security;
alter table public.member_groups       enable row level security;
alter table public.recurring_reminders enable row level security;
alter table public.campaigns           enable row level security;
alter table public.outbound_sms        enable row level security;
alter table public.birthday_log        enable row level security;

-- settings: staff read (needed for {church_name}); only admins change.
create policy "staff read settings"   on public.settings for select to authenticated using (public.is_staff());
create policy "admins update settings" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: everyone sees their own profile; admins see and manage all.
create policy "read own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "admins insert profiles" on public.profiles for insert to authenticated with check (public.is_admin());
create policy "admins update profiles" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete profiles" on public.profiles for delete to authenticated using (public.is_admin());

-- members, groups, member_groups: staff read; admins write.
create policy "staff read members"   on public.members for select to authenticated using (public.is_staff());
create policy "admins insert members" on public.members for insert to authenticated with check (public.is_admin());
create policy "admins update members" on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete members" on public.members for delete to authenticated using (public.is_admin());

create policy "staff read groups"    on public.groups for select to authenticated using (public.is_staff());
create policy "admins insert groups" on public.groups for insert to authenticated with check (public.is_admin());
create policy "admins update groups" on public.groups for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "admins delete groups" on public.groups for delete to authenticated using (public.is_admin());

create policy "staff read member_groups"    on public.member_groups for select to authenticated using (public.is_staff());
create policy "admins insert member_groups" on public.member_groups for insert to authenticated with check (public.is_admin());
create policy "admins delete member_groups" on public.member_groups for delete to authenticated using (public.is_admin());

-- recurring reminders: staff manage (sending messages is an editor task).
create policy "staff read reminders"   on public.recurring_reminders for select to authenticated using (public.is_staff());
create policy "staff insert reminders" on public.recurring_reminders for insert to authenticated with check (public.is_staff());
create policy "staff update reminders" on public.recurring_reminders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "staff delete reminders" on public.recurring_reminders for delete to authenticated using (public.is_staff());

-- campaigns: staff read & create; queue processing/counters are done by the
-- server with the service role, via the functions in migration 3.
create policy "staff read campaigns"   on public.campaigns for select to authenticated using (public.is_staff());
create policy "staff insert campaigns" on public.campaigns for insert to authenticated with check (public.is_staff());

-- outbound_sms and birthday_log: read-only for staff; written only by the server.
create policy "staff read outbound_sms" on public.outbound_sms for select to authenticated using (public.is_staff());
create policy "staff read birthday_log" on public.birthday_log for select to authenticated using (public.is_staff());
