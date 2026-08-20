import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

function effectiveStatus(row) {
  const now = new Date();
  if (row.status === "revoked") return "revoked";
  if (row.status === "expired") return "expired_unused";
  if (row.status === "unused") return row.expires_at && new Date(row.expires_at) <= now ? "expired_unused" : "unused";
  if (row.status === "activated") {
    if (row.export_deadline && new Date(row.export_deadline) <= now) return "expired";
    if ((row.exports_used || 0) > 0) return "used";
    return "active";
  }
  return row.status || "unused";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const { data, error } = await serviceClient()
    .from("license_keys")
    .select("id, key_hint, order_no, amount, contact_platform, status, device_id, douyin_uid, douyin_nickname, douyin_unique_id, created_at, expires_at, activated_at, export_deadline, max_exports, exports_used, export_sessions(douyin_uid)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return fail("database error", 500, req);
  return ok({ licenses: (data || []).map((row) => ({ ...row, status: effectiveStatus(row) })) }, req);
});
