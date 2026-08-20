-- ============================================================
-- 绑定抖音账号和登录态，防止换账号后继续使用同一个激活码
-- 在 Supabase SQL Editor 执行
-- ============================================================

alter table public.license_keys
  add column if not exists douyin_uid text;

alter table public.license_keys
  add column if not exists session_hash text;

alter table public.export_sessions
  add column if not exists douyin_uid text;

alter table public.export_sessions
  add column if not exists session_hash text;

select pg_notify('pgrst', 'reload schema');
