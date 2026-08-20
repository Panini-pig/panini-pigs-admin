-- Add Douyin nickname and unique id for admin display.

alter table public.license_keys
  add column if not exists douyin_nickname text;

alter table public.license_keys
  add column if not exists douyin_unique_id text;

select pg_notify('pgrst', 'reload schema');
