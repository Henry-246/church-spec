-- =============================================================================
-- Make a Supabase Auth user the FIRST admin.
-- (Not a migration: run it once, by hand, after creating the user.)
--
-- 1. Supabase dashboard → Authentication → Users → "Add user" → "Create new user".
--    Enter the email and a strong password, tick "Auto Confirm User".
-- 2. Replace the email and name below, then paste this into SQL Editor → Run.
-- 3. You should see "1 row" in the result. Later admins/editors are added
--    from the app (Admin → Users) by an existing admin.
-- =============================================================================

insert into public.profiles (id, full_name, role)
select id, 'Mike', 'admin'
from auth.users
where email = 'mike@mail.com'
on conflict (id) do update set role = 'admin';
