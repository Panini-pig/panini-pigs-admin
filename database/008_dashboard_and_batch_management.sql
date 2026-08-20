-- Personal admin workstation statistics. Dates are calculated in China Standard Time.
create or replace function public.admin_dashboard_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select
      (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai') as today_start,
      (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai') - interval '6 days' as trend_start
  ),
  totals as (
    select
      count(*) filter (where created_at >= bounds.today_start) as today_orders,
      coalesce(sum(amount) filter (where created_at >= bounds.today_start), 0) as today_revenue,
      count(*) as total_orders,
      coalesce(sum(amount), 0) as total_revenue
    from public.license_keys, bounds
  ),
  days as (
    select generate_series(
      (now() at time zone 'Asia/Shanghai')::date - 6,
      (now() at time zone 'Asia/Shanghai')::date,
      interval '1 day'
    )::date as day
  ),
  daily_totals as (
    select
      days.day,
      count(license_keys.id) as orders,
      coalesce(sum(license_keys.amount), 0) as revenue
    from days
    left join public.license_keys
      on (license_keys.created_at at time zone 'Asia/Shanghai')::date = days.day
    group by days.day
  ),
  trend as (
    select jsonb_agg(jsonb_build_object(
      'date', to_char(day, 'MM-DD'),
      'orders', orders,
      'revenue', revenue
    ) order by day) as trend_data
    from daily_totals
  )
  select jsonb_build_object(
    'today_orders', totals.today_orders,
    'today_revenue', totals.today_revenue,
    'total_orders', totals.total_orders,
    'total_revenue', totals.total_revenue,
    'trend', coalesce(trend.trend_data, '[]'::jsonb)
  )
  from totals, trend;
$$;

revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to service_role;
