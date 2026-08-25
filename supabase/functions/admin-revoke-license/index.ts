import { fail, ok, preflight } from "../_shared/cors.ts";
import { getAdminUser, serviceClient, verifyAdminPassword } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const admin = await getAdminUser(req);
  if (!admin) return fail("unauthorized", 401, req);

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!id || !password || password.length > 1024) return fail("invalid request", 400, req);
  if (!(await verifyAdminPassword(admin, password))) return fail("password verification failed", 403, req);

  const { data, error } = await serviceClient().rpc("admin_revoke_personal_license", {
    p_license_id: id,
    p_admin_email: admin.email,
  });
  if (error) {
    const message = String(error.message || "revoke failed");
    const status = message.includes("not found") ? 404 : message.includes("only active and valid") ? 409 : 503;
    return fail(message, status, req);
  }
  return ok(data || { revoked: true, id }, req);
});
