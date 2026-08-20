-- Security hardening for the licensing backend.
-- Run this migration in the Supabase SQL editor before deploying the updated functions.

alter table public.license_keys
  add column if not exists key_hint text;

-- Existing codes stay revocable by their hash. The UI no longer returns plaintext codes.
update public.license_keys
set key_hint = right(key_plaintext, 4)
where key_hint is null and key_plaintext is not null;

-- Only one unconsumed export session may exist for a license at a time.
with ranked_open_sessions as (
  select id, row_number() over (partition by license_key_id order by created_at desc, id desc) as rank
  from public.export_sessions
  where consumed_at is null
)
update public.export_sessions as sessions
set consumed_at = now()
from ranked_open_sessions as ranked
where sessions.id = ranked.id and ranked.rank > 1;

create unique index if not exists uq_export_sessions_one_open_per_license
  on public.export_sessions (license_key_id)
  where consumed_at is null;

-- Atomically validate and consume an export quota. This prevents concurrent calls
-- from reading the same counter and receiving extra exports.
create or replace function public.consume_export_session(
  p_token_hash text,
  p_device_id text,
  p_douyin_uid text
)
returns table(ok boolean, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_license_id uuid;
  v_used integer;
  v_max integer;
begin
  select es.id, lk.id, lk.exports_used, lk.max_exports
    into v_session_id, v_license_id, v_used, v_max
  from export_sessions es
  join license_keys lk on lk.id = es.license_key_id
  where es.token_hash = p_token_hash
    and es.device_id = p_device_id
    and (es.douyin_uid is null or es.douyin_uid = p_douyin_uid)
    and (lk.douyin_uid is null or lk.douyin_uid = p_douyin_uid)
    and es.consumed_at is null
    and es.expires_at > now()
    and lk.status = 'activated'
    and lk.export_deadline > now()
    and lk.exports_used < lk.max_exports
  for update of es, lk;

  if not found then
    return query select false, 0;
    return;
  end if;

  update license_keys
  set exports_used = v_used + 1,
      last_export_at = now(),
      updated_at = now()
  where id = v_license_id;

  if v_used + 1 >= v_max then
    update export_sessions set consumed_at = now() where id = v_session_id;
  end if;

  return query select true, greatest(0, v_max - (v_used + 1));
end;
$$;

revoke all on function public.consume_export_session(text, text, text) from public;
grant execute on function public.consume_export_session(text, text, text) to service_role;
