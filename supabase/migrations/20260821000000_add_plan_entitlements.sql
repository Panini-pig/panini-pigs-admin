-- V1.7: export, report, and bundle entitlements.
-- Existing keys remain export-only and retain their current export counters.
alter table public.license_keys
  add column if not exists plan_code text not null default 'export'
    check (plan_code in ('export', 'report', 'bundle')),
  add column if not exists report_credits integer not null default 0,
  add column if not exists reports_used integer not null default 0;

create table if not exists public.report_grants (
  id uuid primary key default gen_random_uuid(),
  license_key_id uuid not null references public.license_keys(id) on delete cascade,
  dataset_fingerprint text not null,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (license_key_id, dataset_fingerprint)
);

create index if not exists idx_report_grants_license_key_id
  on public.report_grants (license_key_id);

alter table public.report_grants enable row level security;
grant all on public.report_grants to service_role;

-- Atomically grant a report entitlement. The row lock prevents concurrent
-- requests from consuming more credits than a license owns.
create or replace function public.consume_report_session(
  p_token_hash text,
  p_device_id text,
  p_dataset_fingerprint text
)
returns table(ok boolean, consumed boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license_id uuid;
  v_credits integer;
  v_used integer;
begin
  select lk.id, lk.report_credits, lk.reports_used
    into v_license_id, v_credits, v_used
  from export_sessions es
  join license_keys lk on lk.id = es.license_key_id
  where es.token_hash = p_token_hash
    and es.device_id = p_device_id
    and es.expires_at > now()
    and lk.status = 'activated'
    and lk.plan_code in ('report', 'bundle')
  for update of lk;

  if not found then
    return query select false, false, 0;
    return;
  end if;

  if exists (
    select 1 from report_grants
    where license_key_id = v_license_id
      and dataset_fingerprint = p_dataset_fingerprint
  ) then
    return query select true, false, greatest(0, v_credits - v_used);
    return;
  end if;

  if v_used >= v_credits then
    return query select false, false, 0;
    return;
  end if;

  insert into report_grants (license_key_id, dataset_fingerprint, device_id)
  values (v_license_id, p_dataset_fingerprint, p_device_id);

  update license_keys
  set reports_used = v_used + 1,
      updated_at = now()
  where id = v_license_id;

  insert into audit_logs (action, license_key_id, device_id, detail)
  values ('consume_report', v_license_id, p_device_id,
    json_build_object('dataset_fingerprint', p_dataset_fingerprint)::text);

  return query select true, true, greatest(0, v_credits - (v_used + 1));
end;
$$;

revoke all on function public.consume_report_session(text, text, text) from public;
grant execute on function public.consume_report_session(text, text, text) to service_role;

select pg_notify('pgrst', 'reload schema');
