import { fail, ok, preflight } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  if (!key) return fail("key is required", 400, req);

  const supabase = serviceClient();
  const { data: license, error } = await supabase
    .from("license_keys")
    .select("id")
    .eq("key_hash", await sha256(key))
    .single();
  if (error || !license) return fail("not found", 404, req);

  await supabase.from("license_keys").update({ status: "revoked" }).eq("id", license.id);
  await supabase.from("export_sessions").update({ consumed_at: new Date().toISOString() })
    .eq("license_key_id", license.id).is("consumed_at", null);
  await supabase.from("audit_logs").insert({ action: "revoke_key", license_key_id: license.id });
  return ok({ revoked: true }, req);
});
