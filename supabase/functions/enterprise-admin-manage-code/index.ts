import { fail, ok, preflight } from "../_shared/cors.ts";
import { getAdminUser, serviceClient } from "../_shared/supabase.ts";

const ACTIONS = new Set(["renew", "suspend", "resume", "revoke", "reset_binding"]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const admin = await getAdminUser(req);
  if (!admin) return fail("unauthorized", 401, req);
  const body = await req.json().catch(() => ({}));
  const id = String(body.activation_code_id || "").trim();
  const action = String(body.action || "");
  if (!id || !ACTIONS.has(action)) return fail("invalid request", 400, req);
  const supabase = serviceClient();
  if (action === "renew") {
    const type = String(body.subscription_type || ""), expires = new Date(String(body.subscription_expires_at || ""));
    const amount = Number(body.amount_cents), receipt = String(body.receipt_no || "").trim();
    if (!["monthly", "quarterly", "yearly", "custom"].includes(type) || Number.isNaN(expires.getTime()) || expires <= new Date() ||
        !Number.isSafeInteger(amount) || amount < 0 || amount > 100000000 || !receipt || receipt.length > 100 ||
        !["wechat", "alipay", "bank", "manual"].includes(String(body.payment_method || "manual"))) return fail("invalid request", 400, req);
    const { data, error } = await supabase.rpc("enterprise_admin_renew_code", {
      p_activation_code_id: id, p_subscription_type: type, p_subscription_expires_at: expires.toISOString(),
      p_amount_cents: amount, p_payment_method: String(body.payment_method || "manual"), p_receipt_no: receipt,
      p_remark: String(body.remark || "").trim().slice(0, 500) || null, p_admin_email: admin.email,
    });
    if (error) return fail(error.message.includes("receipt") ? "收款单号已存在" : "续费失败", 409, req);
    return ok({ result: data }, req);
  }
  const { data, error } = await supabase.rpc("enterprise_admin_change_status", {
    p_activation_code_id: id, p_action: action,
    p_remark: String(body.remark || "").trim().slice(0, 500) || null, p_admin_email: admin.email,
  });
  if (error) return fail(error.message.includes("renew") ? "订阅已到期，请先续费" : "操作失败", 409, req);
  return ok({ result: data }, req);
});
