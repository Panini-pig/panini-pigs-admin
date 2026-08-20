-- 管理员资料：按已验证的 Supabase 登录邮箱显示姓名。
-- 在 Supabase SQL Editor 中执行一次。

create table if not exists public.admin_profiles (
  email text primary key,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_profiles enable row level security;
revoke all on table public.admin_profiles from anon, authenticated;

insert into public.admin_profiles (email, display_name)
values
  ('2778934515@qq.com', '顾健炜'),
  ('3510896360@qq.com', '汪显昊')
on conflict (email) do update
set display_name = excluded.display_name,
    updated_at = now();
