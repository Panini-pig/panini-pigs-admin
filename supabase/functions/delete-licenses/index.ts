import { fail, ok, preflight } from "../_shared/cors.ts";
import { getAdminUser, serviceClient, verifyAdminPassword } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const admin = await getAdminUser(req);
  if (!admin) return fail("unauthorized", 401, req);

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  const password = typeof body.password === "string" ? body.password : "";
  if (ids.length === 0 || ids.length > 100 || password.length === 0 || password.length > 1024) {
    return fail("invalid request", 400, req);
  }
  if (!(await verifyAdminPassword(admin, password))) return fail("password verification failed", 403, req);

  const supabase = serviceClient();
  const { data: candidates, error: candidateError } = await supabase
    .from("license_keys").select("id,status,activated_at").in("id", ids);
  if (candidateError) return fail("delete failed", 503, req);
  const eligibleIds = (candidates || []).filter((row) => row.status === "unused" && !row.activated_at).map((row) => row.id);
  if (eligibleIds.length !== ids.length) return fail("only unused and never-activated licenses can be deleted", 409, req);
  const { data, error } = await supabase
    .from("license_keys")
    .delete()
    .in("id", eligibleIds)
    .select("id");
  if (error) return fail("delete failed", 503, req);

  const deletedIds = (data || []).map((row) => row.id);
  await supabase.from("audit_logs").insert({
    action: "delete_licenses",
    detail: JSON.stringify({ requested: ids.length, deleted: deletedIds.length, license_ids: deletedIds, admin_email: admin.email }),
  });
  return ok({ deleted: deletedIds.length, ids: deletedIds }, req);
});
