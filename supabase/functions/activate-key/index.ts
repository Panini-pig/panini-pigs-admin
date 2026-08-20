import { fail, ok, preflight } from "../_shared/cors.ts";
import { generateToken, sha256 } from "../_shared/crypto.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  const deviceId = String(body.device_id || "").trim();
  const douyinUid = String(body.douyin_uid || "").trim();
  const sessionHash = String(body.session_hash || "").trim();
  const douyinNickname = String(body.douyin_nickname || "").trim();
  const douyinUniqueId = String(body.douyin_unique_id || "").trim();
  if (!key || !deviceId || !douyinUid || deviceId.length > 256 || douyinUid.length > 256) {
    return fail("invalid request", 400, req);
  }

  const supabase = serviceClient();
  const { data: license, error } = await supabase
    .from("license_keys")
    .select("*")
    .eq("key_hash", await sha256(key))
    .single();
  if (error || !license) return fail("activation failed", 404, req);

  const now = new Date();
  const expiresAt = new Date(license.expires_at);
  const reusable = license.status === "activated" && license.device_id === deviceId &&
    license.export_deadline && new Date(license.export_deadline) > now &&
    license.exports_used < license.max_exports && (!license.douyin_uid || license.douyin_uid === douyinUid);
  if (!(license.status === "unused" || reusable) || expiresAt <= now) {
    if (expiresAt <= now) await supabase.from("license_keys").update({ status: "expired" }).eq("id", license.id);
    return fail("activation unavailable", 403, req);
  }

  const exportDeadline = license.export_deadline && new Date(license.export_deadline) > now
    ? license.export_deadline
    : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { error: updateError } = await supabase.from("license_keys").update({
    status: "activated", device_id: deviceId, activated_at: license.activated_at || now.toISOString(),
    export_deadline: exportDeadline, douyin_uid: douyinUid,
    session_hash: sessionHash || license.session_hash || null,
    douyin_nickname: douyinNickname || license.douyin_nickname || null,
    douyin_unique_id: douyinUniqueId || license.douyin_unique_id || null,
  }).eq("id", license.id);
  if (updateError) return fail("activation unavailable", 503, req);

  // Replacing a prior session keeps the one-open-session constraint intact.
  await supabase.from("export_sessions").update({ consumed_at: now.toISOString() })
    .eq("license_key_id", license.id).is("consumed_at", null);
  const token = generateToken();
  const { error: sessionError } = await supabase.from("export_sessions").insert({
    license_key_id: license.id, token_hash: await sha256(token), device_id: deviceId,
    douyin_uid: douyinUid, session_hash: sessionHash || null,
    expires_at: new Date(Math.min(new Date(exportDeadline).getTime(), now.getTime() + 24 * 60 * 60 * 1000)).toISOString(),
  });
  if (sessionError) return fail("activation unavailable", 503, req);

  await supabase.from("audit_logs").insert({ action: "activate_key", license_key_id: license.id, device_id: deviceId });
  return ok({ token, export_deadline: exportDeadline, max_exports: license.max_exports, exports_used: license.exports_used, douyin_uid: douyinUid, douyin_nickname: douyinNickname, douyin_unique_id: douyinUniqueId }, req);
});
