-- ============================================================
-- 修复：service_role 对收费表权限不足
-- 在 Supabase SQL Editor 执行
-- ============================================================

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;
