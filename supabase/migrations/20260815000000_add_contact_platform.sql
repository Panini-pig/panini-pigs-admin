-- Add first-contact platform for license source tracking.

alter table public.license_keys
  add column if not exists contact_platform text;

select pg_notify('pgrst', 'reload schema');
