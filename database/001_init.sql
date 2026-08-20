-- ============================================================
-- 抖音聊天记录导出工具 · Supabase 初始表结构
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

create extension if not exists pgcrypto;

-- 激活码表
create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_plaintext text,
  order_no text,
  amount numeric(10, 2) not null default 0,
  status text not null default 'unused'
    check (status in ('unused', 'activated', 'revoked', 'expired')),
  device_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  activated_at timestamptz,
  export_deadline timestamptz,
  max_exports integer not null default 3,
  exports_used integer not null default 0,
  last_export_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 导出授权 / Token 表
create table if not exists public.export_sessions (
  id uuid primary key default gen_random_uuid(),
  license_key_id uuid not null references public.license_keys(id) on delete cascade,
  token_hash text not null unique,
  device_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

-- 操作日志表
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  license_key_id uuid,
  device_id text,
  ip text,
  detail text,
  created_at timestamptz not null default now()
);

-- 索引
create index if not exists idx_license_keys_key_hash
  on public.license_keys (key_hash);

create index if not exists idx_license_keys_status
  on public.license_keys (status);

create index if not exists idx_export_sessions_token_hash
  on public.export_sessions (token_hash);

create index if not exists idx_export_sessions_license_key_id
  on public.export_sessions (license_key_id);

create index if not exists idx_audit_logs_license_key_id
  on public.audit_logs (license_key_id);

-- RLS：表只允许 service_role 通过 Edge Function 访问
alter table public.license_keys enable row level security;
alter table public.export_sessions enable row level security;
alter table public.audit_logs enable row level security;

-- 不创建 anon 策略，默认拒绝客户端直连

-- 显式授权 service_role 访问
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- 以后新建表也自动授权给 service_role
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;
