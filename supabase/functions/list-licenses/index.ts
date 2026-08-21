import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

function effectiveStatus(row) {
  const now = new Date();
  if (row.status === "revoked") return "revoked";
  const activated = row.status === "activated" || Boolean(row.activated_at);
  const used = Number(row.exports_used || 0) > 0 || Number(row.reports_used || 0) > 0;
  const deadline = activated ? row.export_deadline : row.expires_at;
  const expired = row.status === "expired" || Boolean(deadline && new Date(deadline) <= now);

  if (!activated) return expired ? "inactive_unused_expired" : "inactive_unused_valid";
  if (!used) return expired ? "active_unused_expired" : "active_unused_valid";
  return expired ? "active_used_expired" : "active_used_valid";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const { data, error } = await serviceClient()
    .from("license_keys")
    .select("id, key_hint, order_no, amount, contact_platform, status, device_id, douyin_uid, douyin_nickname, douyin_unique_id, created_at, expires_at, activated_at, export_deadline, plan_code, max_exports, exports_used, report_credits, reports_used, export_sessions(douyin_uid)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return fail("database error", 500, req);
  return ok({ licenses: (data || []).map((row) => ({ ...row, status: effectiveStatus(row) })) }, req);
});
