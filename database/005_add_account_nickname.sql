-- ============================================================
-- 增加抖音昵称和唯一 ID，方便管理后台识别客户账号
-- 在 Supabase SQL Editor 执行
-- ============================================================

alter table public.license_keys
  add column if not exists douyin_nickname text;

alter table public.license_keys
  add column if not exists douyin_unique_id text;

select pg_notify('pgrst', 'reload schema');
