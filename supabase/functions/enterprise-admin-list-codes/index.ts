import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

function displayState(row: Record<string, unknown>) {
  if (row.status === "revoked") return "revoked";
  if (row.status === "suspended") return "suspended";
  if (new Date(String(row.subscription_expires_at)) <= new Date()) return "expired";
  if (row.device_hash && row.douyin_uid) return "active";
  return "unused";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);
  const body = await req.json().catch(() => ({}));
  const page = Math.max(1, Math.trunc(Number(body.page) || 1));
  const pageSize = Math.min(50, Math.max(10, Math.trunc(Number(body.page_size) || 20)));
  const search = String(body.search || "").trim().replace(/[%_(),]/g, "").slice(0, 100);
  const state = String(body.status || "all");
  const supabase = serviceClient();
  let query = supabase.from("enterprise_activation_codes").select(
    "id,key_hint,status,company_name,contact_name,contact_phone,contact_platform,subscription_type,subscription_expires_at,device_hash,device_name,douyin_uid,douyin_nickname,douyin_unique_id,activated_at,last_validated_at,client_version,remark,created_at",
    { count: "exact" },
  );
  if (search) query = query.or(`company_name.ilike.%${search}%,key_hint.ilike.%${search}%`);
  const now = new Date().toISOString();
  if (state === "revoked" || state === "suspended") query = query.eq("status", state);
  if (state === "expired") query = query.lte("subscription_expires_at", now).not("status", "in", '("suspended","revoked")');
  if (state === "unused") query = query.gt("subscription_expires_at", now).is("device_hash", null).not("status", "in", '("suspended","revoked")');
  if (state === "active") query = query.gt("subscription_expires_at", now).not("device_hash", "is", null).not("douyin_uid", "is", null).not("status", "in", '("suspended","revoked")');
  const { data: rows, error, count } = await query.order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return fail("database error", 500, req);
  const ids = (rows || []).map((row) => row.id);
  const payments = ids.length ? (await supabase.from("enterprise_payments")
    .select("activation_code_id,amount_cents,paid_at").in("activation_code_id", ids)
    .order("paid_at", { ascending: false })).data || [] : [];
  const payMap = new Map<string, { total: number; latest: string | null }>();
  for (const payment of payments) {
    const value = payMap.get(payment.activation_code_id) || { total: 0, latest: null };
    value.total += Number(payment.amount_cents || 0); value.latest ||= payment.paid_at;
    payMap.set(payment.activation_code_id, value);
  }
  const codes = (rows || []).map((row) => {
    const pay = payMap.get(row.id) || { total: 0, latest: null };
    return { ...row, display_status: displayState(row),
      remaining_days: Math.max(0, Math.ceil((new Date(row.subscription_expires_at).getTime() - Date.now()) / 86400000)),
      total_amount_cents: pay.total, latest_payment_at: pay.latest };
  });
  return ok({ codes, page, page_size: pageSize, total: count || 0, total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)) }, req);
});
