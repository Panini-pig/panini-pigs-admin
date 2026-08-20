-- ============================================================
-- 增加激活码明文列，供管理后台显示和复制
-- 在 Supabase SQL Editor 执行
-- ============================================================

alter table public.license_keys
  add column if not exists key_plaintext text;
