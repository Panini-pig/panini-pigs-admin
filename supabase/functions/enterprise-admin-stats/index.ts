import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

function beijingDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function startOfBeijingDay(date: Date) { return new Date(`${beijingDateParts(date)}T00:00:00+08:00`); }

async function fetchAll(supabase: any, table: string, columns: string, orderColumn: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(orderColumn, { ascending: true }).range(start, start + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);
  const now = new Date(), todayStart = startOfBeijingDay(now), trendStart = new Date(todayStart.getTime() - 6 * 86400000);
  const supabase = serviceClient();
  let payments: any[], codes: any[];
  try {
    [payments, codes] = await Promise.all([
      fetchAll(supabase, "enterprise_payments", "amount_cents,paid_at", "paid_at"),
      fetchAll(supabase, "enterprise_activation_codes", "status,subscription_expires_at,device_hash,douyin_uid", "subscription_expires_at"),
    ]);
  } catch { return fail("statistics unavailable", 503, req); }
  const validCodes = codes.filter((row) => !["suspended", "revoked"].includes(row.status) && new Date(row.subscription_expires_at) > now);
  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(trendStart.getTime() + index * 86400000), end = new Date(start.getTime() + 86400000);
    const rows = payments.filter((row) => { const time = new Date(row.paid_at); return time >= start && time < end; });
    return { date: beijingDateParts(start).slice(5), orders: rows.length, revenue: rows.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0) / 100 };
  });
  const today = payments.filter((row) => new Date(row.paid_at) >= todayStart);
  return ok({ stats: {
    today_payments: today.length, today_revenue: today.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0) / 100,
    total_payments: payments.length, total_revenue: payments.reduce((sum, row) => sum + Number(row.amount_cents || 0), 0) / 100,
    active_subscriptions: validCodes.length,
    expiring_soon: validCodes.filter((row) => new Date(row.subscription_expires_at) <= weekEnd).length,
    trend,
  } }, req);
});
