import { fail, ok, preflight } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const deviceId = String(body.device_id || "").trim();
  const douyinUid = String(body.douyin_uid || "").trim();
  if (!token || !deviceId || !douyinUid) return fail("invalid request", 400, req);

  const supabase = serviceClient();
  const tokenHash = await sha256(token);
  const { data: session } = await supabase.from("export_sessions")
    .select("license_key_id").eq("token_hash", tokenHash).maybeSingle();

  const { data, error } = await supabase
    .rpc("consume_export_session", {
      p_token_hash: tokenHash,
      p_device_id: deviceId,
      p_douyin_uid: douyinUid,
    })
    .single();

  if (error) return fail("service unavailable", 503, req);
  if (!data?.ok) return fail("authorization unavailable", 403, req);
  if (session?.license_key_id) {
    await supabase.from("audit_logs").insert({ action: "consume_export", license_key_id: session.license_key_id, device_id: deviceId, detail: JSON.stringify({ remaining: data.remaining }) });
  }
  return ok({ remaining: data.remaining }, req);
});
