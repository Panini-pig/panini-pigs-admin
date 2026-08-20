import { fail, ok, preflight } from "../_shared/cors.ts";
import { generateLicenseKey, sha256 } from "../_shared/crypto.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const body = await req.json().catch(() => ({}));
  const orderNo = String(body.order_no || "").trim() || null;
  const amount = Number(body.amount || 0);
  const contactPlatform = String(body.contact_platform || "").trim() || "other";
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000 || (orderNo && orderNo.length > 128) || contactPlatform.length > 32) {
    return fail("invalid request", 400, req);
  }

  const key = generateLicenseKey();
  const keyHash = await sha256(key);
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from("license_keys")
    .insert({
      key_hash: keyHash,
      key_hint: key.slice(-4),
      order_no: orderNo,
      amount,
      contact_platform: contactPlatform,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) return fail("database error", 500, req);

  await supabase.from("audit_logs").insert({
    action: "create_license",
    license_key_id: data.id,
    detail: JSON.stringify({ order_no: orderNo, amount, contact_platform: contactPlatform }),
  });

  return ok({ license_key_id: data.id, key, expires_at: expiresAt }, req);
});
