import { fail, ok, preflight } from "../_shared/cors.ts";
import { sha256 } from "../_shared/crypto.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const deviceId = String(body.device_id || "").trim();
  const datasetFingerprint = String(body.dataset_fingerprint || "").trim();
  if (!token || !deviceId || !datasetFingerprint || deviceId.length > 256 || datasetFingerprint.length > 512) {
    return fail("invalid request", 400, req);
  }

  const { data, error } = await serviceClient()
    .rpc("consume_report_session", {
      p_token_hash: await sha256(token),
      p_device_id: deviceId,
      p_dataset_fingerprint: datasetFingerprint,
    })
    .single();

  if (error) return fail("service unavailable", 503, req);
  if (!data?.ok) return fail("report quota unavailable", 403, req);
  return ok({ granted: true, consumed: data.consumed, remaining: data.remaining }, req);
});
