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

  const { data: session, error } = await serviceClient()
    .from("export_sessions")
    .select("id, device_id, douyin_uid, expires_at, consumed_at, license_keys(status, exports_used, max_exports, export_deadline, douyin_uid)")
    .eq("token_hash", await sha256(token))
    .single();
  if (error || !session) return fail("authorization unavailable", 401, req);

  const now = new Date();
  const license = session.license_keys;
  const valid = session.device_id === deviceId &&
    (!session.douyin_uid || session.douyin_uid === douyinUid) &&
    (!license.douyin_uid || license.douyin_uid === douyinUid) &&
    !session.consumed_at && new Date(session.expires_at) > now &&
    license.status === "activated" && license.export_deadline &&
    new Date(license.export_deadline) > now && license.exports_used < license.max_exports;
  if (!valid) return fail("authorization unavailable", 403, req);
  return ok({ valid: true, remaining: license.max_exports - license.exports_used, export_deadline: license.export_deadline }, req);
});
