import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  if (ids.length === 0 || ids.length > 100) return fail("invalid request", 400, req);

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("license_keys")
    .delete()
    .in("id", ids)
    .eq("status", "unused")
    .select("id");
  if (error) return fail("delete failed", 503, req);

  const deletedIds = (data || []).map((row) => row.id);
  await supabase.from("audit_logs").insert({
    action: "delete_unused_licenses",
    detail: JSON.stringify({ requested: ids.length, deleted: deletedIds.length, license_ids: deletedIds }),
  });
  return ok({ deleted: deletedIds.length, ids: deletedIds }, req);
});
