-- Enterprise subscription administration integration.
-- Review and apply from the enterprise subscription service migration history.
-- Do not run an unreviewed `supabase db push` from the admin directory.

begin;

alter table public.enterprise_activation_codes
  add column if not exists contact_platform text;

create or replace function public.enterprise_admin_create_code(
  p_key_hash text,
  p_key_hint text,
  p_company_name text,
  p_contact_name text,
  p_contact_phone text,
  p_contact_platform text,
  p_subscription_type text,
  p_subscription_expires_at timestamptz,
  p_amount_cents integer,
  p_payment_method text,
  p_receipt_no text,
  p_remark text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code public.enterprise_activation_codes%rowtype;
  v_now timestamptz := now();
begin
  if p_key_hash is null or length(p_key_hash) <> 64 or p_key_hint is null or length(p_key_hint) <> 4 then
    raise exception 'invalid activation code';
  end if;
  if nullif(btrim(p_company_name), '') is null then raise exception 'company name is required'; end if;
  if p_subscription_type not in ('monthly', 'quarterly', 'yearly', 'custom') then raise exception 'invalid subscription type'; end if;
  if p_subscription_expires_at is null or p_subscription_expires_at <= v_now then raise exception 'expiry must be in the future'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'invalid amount'; end if;
  if nullif(btrim(p_receipt_no), '') is null then raise exception 'receipt number is required'; end if;

  insert into public.enterprise_activation_codes (
    key_hash, key_hint, status, company_name, contact_name, contact_phone,
    contact_platform, subscription_type, subscription_expires_at, remark
  ) values (
    p_key_hash, upper(p_key_hint), 'unused', left(btrim(p_company_name), 200),
    nullif(left(btrim(coalesce(p_contact_name, '')), 100), ''),
    nullif(left(btrim(coalesce(p_contact_phone, '')), 40), ''),
    nullif(left(btrim(coalesce(p_contact_platform, '')), 32), ''),
    p_subscription_type, p_subscription_expires_at,
    nullif(left(btrim(coalesce(p_remark, '')), 500), '')
  ) returning * into v_code;

  insert into public.enterprise_payments (
    activation_code_id, receipt_no, subscription_type, amount_cents,
    payment_method, paid_at, period_start, period_end, remark
  ) values (
    v_code.id, left(btrim(p_receipt_no), 100), p_subscription_type, p_amount_cents,
    left(btrim(coalesce(nullif(p_payment_method, ''), 'manual')), 32), v_now,
    v_now, p_subscription_expires_at,
    nullif(left(btrim(coalesce(p_remark, '')), 500), '')
  );

  insert into public.enterprise_logs (activation_code_id, event_type, result, detail)
  values (v_code.id, 'admin_create', 'success', jsonb_strip_nulls(jsonb_build_object(
    'key_hint', v_code.key_hint, 'admin_email', p_admin_email,
    'receipt_no', p_receipt_no, 'amount_cents', p_amount_cents
  )));
  return jsonb_build_object('activation_code_id', v_code.id, 'subscription_expires_at', v_code.subscription_expires_at);
end
$$;

create or replace function public.enterprise_admin_renew_code(
  p_activation_code_id uuid,
  p_subscription_type text,
  p_subscription_expires_at timestamptz,
  p_amount_cents integer,
  p_payment_method text,
  p_receipt_no text,
  p_remark text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code public.enterprise_activation_codes%rowtype;
  v_existing public.enterprise_payments%rowtype;
  v_now timestamptz := now();
  v_status text;
begin
  select * into v_code from public.enterprise_activation_codes where id = p_activation_code_id for update;
  if not found then raise exception 'activation code not found'; end if;
  select * into v_existing from public.enterprise_payments where receipt_no = left(btrim(p_receipt_no), 100);
  if found then
    if v_existing.activation_code_id <> p_activation_code_id then raise exception 'receipt number already exists'; end if;
    return jsonb_build_object('activation_code_id', v_code.id, 'subscription_expires_at', v_code.subscription_expires_at, 'idempotent', true);
  end if;
  if p_subscription_type not in ('monthly', 'quarterly', 'yearly', 'custom') then raise exception 'invalid subscription type'; end if;
  if p_subscription_expires_at is null or p_subscription_expires_at <= v_now then raise exception 'expiry must be in the future'; end if;
  if p_amount_cents is null or p_amount_cents < 0 then raise exception 'invalid amount'; end if;
  if nullif(btrim(p_receipt_no), '') is null then raise exception 'receipt number is required'; end if;

  v_status := case
    when v_code.status in ('suspended', 'revoked') then v_code.status
    when v_code.device_hash is not null and v_code.douyin_uid is not null then 'active'
    else 'unused'
  end;
  update public.enterprise_activation_codes
    set subscription_type = p_subscription_type,
        subscription_expires_at = p_subscription_expires_at,
        status = v_status,
        remark = coalesce(nullif(left(btrim(coalesce(p_remark, '')), 500), ''), remark)
    where id = v_code.id returning * into v_code;

  insert into public.enterprise_payments (
    activation_code_id, receipt_no, subscription_type, amount_cents,
    payment_method, paid_at, period_start, period_end, remark
  ) values (
    v_code.id, left(btrim(p_receipt_no), 100), p_subscription_type, p_amount_cents,
    left(btrim(coalesce(nullif(p_payment_method, ''), 'manual')), 32), v_now,
    v_now, p_subscription_expires_at,
    nullif(left(btrim(coalesce(p_remark, '')), 500), '')
  );
  insert into public.enterprise_logs (activation_code_id, event_type, result, detail)
  values (v_code.id, 'admin_renew', 'success', jsonb_strip_nulls(jsonb_build_object(
    'key_hint', v_code.key_hint, 'admin_email', p_admin_email,
    'receipt_no', p_receipt_no, 'amount_cents', p_amount_cents,
    'subscription_expires_at', p_subscription_expires_at
  )));
  return jsonb_build_object('activation_code_id', v_code.id, 'subscription_expires_at', v_code.subscription_expires_at, 'idempotent', false);
end
$$;

create or replace function public.enterprise_admin_change_status(
  p_activation_code_id uuid,
  p_action text,
  p_remark text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code public.enterprise_activation_codes%rowtype;
  v_status text;
  v_event text;
begin
  select * into v_code from public.enterprise_activation_codes where id = p_activation_code_id for update;
  if not found then raise exception 'activation code not found'; end if;
  if p_action not in ('suspend', 'resume', 'revoke', 'reset_binding') then raise exception 'invalid action'; end if;

  if p_action = 'suspend' then
    if v_code.status = 'revoked' then raise exception 'revoked subscription cannot be suspended'; end if;
    v_status := 'suspended'; v_event := 'admin_suspend';
    update public.enterprise_activation_codes set status = v_status where id = v_code.id;
  elsif p_action = 'resume' then
    if v_code.status = 'revoked' then raise exception 'revoked subscription cannot be resumed'; end if;
    if v_code.subscription_expires_at <= now() then raise exception 'renew subscription before resuming'; end if;
    v_status := case when v_code.device_hash is not null and v_code.douyin_uid is not null then 'active' else 'unused' end;
    v_event := 'admin_resume';
    update public.enterprise_activation_codes set status = v_status where id = v_code.id;
  elsif p_action = 'revoke' then
    v_status := 'revoked'; v_event := 'admin_revoke';
    update public.enterprise_activation_codes set status = v_status, access_token_hash = null, token_issued_at = null where id = v_code.id;
  else
    v_status := case when v_code.subscription_expires_at <= now() then 'expired' else 'unused' end;
    v_event := 'admin_reset_binding';
    update public.enterprise_activation_codes set
      status = v_status, device_hash = null, device_name = null,
      douyin_uid = null, douyin_nickname = null, douyin_unique_id = null,
      access_token_hash = null, token_issued_at = null
    where id = v_code.id;
  end if;
  insert into public.enterprise_logs (activation_code_id, event_type, result, detail)
  values (v_code.id, v_event, 'success', jsonb_strip_nulls(jsonb_build_object(
    'key_hint', v_code.key_hint, 'admin_email', p_admin_email,
    'new_status', v_status, 'remark', nullif(left(btrim(coalesce(p_remark, '')), 500), '')
  )));
  return jsonb_build_object('activation_code_id', v_code.id, 'status', v_status);
end
$$;

revoke all on function public.enterprise_admin_create_code(text,text,text,text,text,text,text,timestamptz,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.enterprise_admin_renew_code(uuid,text,timestamptz,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.enterprise_admin_change_status(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.enterprise_admin_create_code(text,text,text,text,text,text,text,timestamptz,integer,text,text,text,text) to service_role;
grant execute on function public.enterprise_admin_renew_code(uuid,text,timestamptz,integer,text,text,text,text) to service_role;
grant execute on function public.enterprise_admin_change_status(uuid,text,text,text) to service_role;

create index if not exists idx_enterprise_activation_company
  on public.enterprise_activation_codes (company_name);
create index if not exists idx_enterprise_payments_paid_at
  on public.enterprise_payments (paid_at desc);

-- Transactional smoke test. All generated rows are rolled back by the
-- intentional exception; only the verified functions remain installed.
do $$
declare
  v_key_hash text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_receipt text := 'SELFTEST-CREATE-' || replace(gen_random_uuid()::text, '-', '');
  v_renew_receipt text := 'SELFTEST-RENEW-' || replace(gen_random_uuid()::text, '-', '');
  v_code_id uuid;
  v_create jsonb;
  v_renew jsonb;
  v_expiry timestamptz := clock_timestamp() + interval '1 month';
  v_renew_expiry timestamptz := clock_timestamp() + interval '3 months';
begin
  begin
    v_create := public.enterprise_admin_create_code(
      v_key_hash, 'TEST', '后台事务自测企业', '自测联系人', null, '其他',
      'monthly', v_expiry, 19900, 'manual', v_receipt, '自动回滚自测', 'self-test@local'
    );
    v_code_id := (v_create ->> 'activation_code_id')::uuid;
    if v_code_id is null or not exists (
      select 1 from public.enterprise_payments where activation_code_id = v_code_id and receipt_no = v_receipt
    ) or not exists (
      select 1 from public.enterprise_logs where activation_code_id = v_code_id and event_type = 'admin_create'
    ) then raise exception 'enterprise admin create self-test failed'; end if;

    v_renew := public.enterprise_admin_renew_code(
      v_code_id, 'quarterly', v_renew_expiry, 49900, 'manual', v_renew_receipt,
      '自动回滚续费自测', 'self-test@local'
    );
    if (select count(*) from public.enterprise_payments where activation_code_id = v_code_id) <> 2 then
      raise exception 'enterprise admin renew self-test failed';
    end if;
    perform public.enterprise_admin_renew_code(
      v_code_id, 'yearly', clock_timestamp() + interval '1 year', 99900, 'manual',
      v_renew_receipt, '幂等自测', 'self-test@local'
    );
    if (select count(*) from public.enterprise_payments where activation_code_id = v_code_id) <> 2
       or (select subscription_expires_at from public.enterprise_activation_codes where id = v_code_id) <> v_renew_expiry then
      raise exception 'enterprise admin renewal idempotency self-test failed';
    end if;

    perform public.enterprise_admin_change_status(v_code_id, 'suspend', null, 'self-test@local');
    perform public.enterprise_admin_change_status(v_code_id, 'resume', null, 'self-test@local');
    perform public.enterprise_admin_change_status(v_code_id, 'reset_binding', null, 'self-test@local');
    perform public.enterprise_admin_change_status(v_code_id, 'revoke', null, 'self-test@local');
    if (select status from public.enterprise_activation_codes where id = v_code_id) <> 'revoked' then
      raise exception 'enterprise admin status self-test failed';
    end if;

    raise exception 'ENTERPRISE_ADMIN_INTEGRATION_SELF_TEST_ROLLBACK';
  exception when others then
    if sqlerrm <> 'ENTERPRISE_ADMIN_INTEGRATION_SELF_TEST_ROLLBACK' then raise; end if;
  end;
  if exists (select 1 from public.enterprise_activation_codes where key_hash = v_key_hash) then
    raise exception 'enterprise admin self-test cleanup failed';
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
commit;
