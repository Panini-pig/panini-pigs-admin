begin;

create or replace function public.admin_revoke_personal_license(
  p_license_id uuid,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.license_keys%rowtype;
begin
  select * into v_license
  from public.license_keys
  where id = p_license_id
  for update;

  if not found then raise exception 'not found'; end if;
  if v_license.status = 'revoked' then
    return jsonb_build_object('revoked', true, 'already_revoked', true, 'id', v_license.id);
  end if;
  if v_license.status <> 'activated'
     or v_license.activated_at is null
     or v_license.export_deadline is null
     or v_license.export_deadline <= now() then
    raise exception 'only active and valid licenses can be revoked';
  end if;

  update public.license_keys
  set status = 'revoked', updated_at = now()
  where id = v_license.id;

  update public.export_sessions
  set consumed_at = now()
  where license_key_id = v_license.id and consumed_at is null;

  insert into public.audit_logs(action, license_key_id, detail)
  values ('admin_revoke_license', v_license.id, jsonb_build_object(
    'key_hint', v_license.key_hint,
    'previous_status', v_license.status,
    'admin_email', nullif(left(lower(btrim(coalesce(p_admin_email, ''))), 320), '')
  )::text);

  return jsonb_build_object('revoked', true, 'id', v_license.id);
end
$$;

revoke all on function public.admin_revoke_personal_license(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_personal_license(uuid, text) to service_role;

-- Transactional smoke test. The nested block deliberately rolls back every
-- generated row after validating the status, session, and audit-log changes.
do $$
declare
  v_license_id uuid;
  v_hash text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  begin
    insert into public.license_keys(
      key_hash, key_hint, status, device_id, created_at, expires_at,
      activated_at, export_deadline, max_exports, exports_used
    ) values (
      v_hash, 'TEST', 'activated', 'transaction-self-test', now(), now() + interval '1 day',
      now(), now() + interval '1 day', 3, 0
    ) returning id into v_license_id;

    insert into public.export_sessions(
      license_key_id, token_hash, device_id, created_at, expires_at
    ) values (
      v_license_id, replace(gen_random_uuid()::text, '-', ''), 'transaction-self-test', now(), now() + interval '1 day'
    );

    perform public.admin_revoke_personal_license(v_license_id, 'self-test@local');
    if (select status from public.license_keys where id = v_license_id) <> 'revoked'
       or exists (select 1 from public.export_sessions where license_key_id = v_license_id and consumed_at is null)
       or not exists (select 1 from public.audit_logs where license_key_id = v_license_id and action = 'admin_revoke_license') then
      raise exception 'personal license revoke self-test failed';
    end if;

    raise exception 'PERSONAL_LICENSE_REVOKE_SELF_TEST_ROLLBACK';
  exception when others then
    if sqlerrm <> 'PERSONAL_LICENSE_REVOKE_SELF_TEST_ROLLBACK' then raise; end if;
  end;

  if exists (select 1 from public.license_keys where key_hash = v_hash) then
    raise exception 'personal license revoke self-test cleanup failed';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
commit;
