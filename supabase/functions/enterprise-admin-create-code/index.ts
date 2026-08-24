import { fail, ok, preflight } from "../_shared/cors.ts";
import { generateEnterpriseActivationCode, sha256 } from "../_shared/crypto.ts";
import { getAdminUser, serviceClient } from "../_shared/supabase.ts";

const TYPES = new Set(["monthly", "quarterly", "yearly", "custom"]);
const METHODS = new Set(["wechat", "alipay", "bank", "manual"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  const admin = await getAdminUser(req);
  if (!admin) return fail("unauthorized", 401, req);
  const body = await req.json().catch(() => ({}));
  const companyName = String(body.company_name || "").trim();
  const subscriptionType = String(body.subscription_type || "");
  const expiresAt = new Date(String(body.subscription_expires_at || ""));
  const amountCents = Number(body.amount_cents);
  const receiptNo = String(body.receipt_no || "").trim();
  const paymentMethod = String(body.payment_method || "manual");
  if (!companyName || companyName.length > 200 || !TYPES.has(subscriptionType) ||
      Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() ||
      !Number.isSafeInteger(amountCents) || amountCents < 0 || amountCents > 100000000 ||
      !receiptNo || receiptNo.length > 100 || !METHODS.has(paymentMethod)) {
    return fail("invalid request", 400, req);
  }
  const limits: Record<string, number> = { contact_name: 100, contact_phone: 40, contact_platform: 32, remark: 500 };
  if (!Object.entries(limits).every(([key, max]) => String(body[key] || "").length <= max)) return fail("invalid request", 400, req);

  const key = generateEnterpriseActivationCode().trim().toUpperCase();
  const { data, error } = await serviceClient().rpc("enterprise_admin_create_code", {
    p_key_hash: await sha256(key), p_key_hint: key.slice(-4), p_company_name: companyName,
    p_contact_name: String(body.contact_name || "").trim() || null,
    p_contact_phone: String(body.contact_phone || "").trim() || null,
    p_contact_platform: String(body.contact_platform || "").trim() || null,
    p_subscription_type: subscriptionType, p_subscription_expires_at: expiresAt.toISOString(),
    p_amount_cents: amountCents, p_payment_method: paymentMethod, p_receipt_no: receiptNo,
    p_remark: String(body.remark || "").trim() || null, p_admin_email: admin.email,
  });
  if (error) return fail(error.message.includes("receipt") ? "收款单号已存在" : "创建企业订阅失败", 409, req);
  return ok({ ...data, key, company_name: companyName, subscription_type: subscriptionType, amount_cents: amountCents }, req);
});
