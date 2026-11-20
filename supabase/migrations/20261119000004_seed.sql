-- =============================================================================
-- 4/4  SEED: default settings and starter groups
-- Safe to run again (it never overwrites existing data).
-- Change the church name etc. later in the admin Settings page.
-- =============================================================================

insert into public.settings (id, church_name)
values (true, 'Our Church')
on conflict (id) do nothing;

insert into public.groups (name) values
  ('Youth'),
  ('Choir'),
  ('Ushers'),
  ('Women''s Fellowship'),
  ('Men''s Fellowship'),
  ('Children''s Ministry')
on conflict (name) do nothing;
