-- ============================================================
-- 记录首次联系平台，方便后台统计客户来源
-- 在 Supabase SQL Editor 执行
-- ============================================================

alter table public.license_keys
  add column if not exists contact_platform text;

select pg_notify('pgrst', 'reload schema');
