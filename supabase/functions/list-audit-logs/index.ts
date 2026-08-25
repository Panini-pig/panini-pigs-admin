import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

const visibleActions = ["create_license", "activate_key", "consume_export", "consume_report", "admin_revoke_license"];
function parseDetail(value: unknown): Record<string, unknown> { if (!value) return {}; if (typeof value === "object") return value as Record<string, unknown>; try { return JSON.parse(String(value)); } catch { return {}; } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(100, Math.max(20, Number(body.limit) || 50));
  const supabase = serviceClient();
  const { data: logs, error } = await supabase.from("audit_logs").select("id, action, license_key_id, device_id, detail, created_at").in("action", visibleActions).order("created_at", { ascending: false }).limit(limit);
  if (error) return fail("database error", 500, req);
  const licenseIds = [...new Set((logs || []).map((row) => row.license_key_id).filter(Boolean))];
  const licenseMap = new Map();
  if (licenseIds.length) {
    const { data: licenses, error: licenseError } = await supabase.from("license_keys").select("id, key_hint, order_no, amount, contact_platform, douyin_nickname, douyin_uid").in("id", licenseIds);
    if (licenseError) return fail("database error", 500, req);
    for (const license of licenses || []) licenseMap.set(license.id, license);
  }
  const entries = (logs || []).map((row) => {
    const detail = parseDetail(row.detail); const license = licenseMap.get(row.license_key_id) || {};
    return { id: row.id, action: row.action, created_at: row.created_at, key_hint: license.key_hint || detail.key_hint || null, order_no: license.order_no || detail.order_no || null, amount: license.amount ?? detail.amount ?? null, contact_platform: license.contact_platform || detail.contact_platform || null, douyin_nickname: license.douyin_nickname || null, douyin_uid: license.douyin_uid || null, remaining: detail.remaining ?? null };
  });
  return ok({ logs: entries }, req);
});
