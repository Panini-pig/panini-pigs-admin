import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

const EVENTS = new Set(["activate", "refresh", "scrape", "export", "admin_create", "admin_renew", "admin_suspend", "admin_resume", "admin_revoke", "admin_reset_binding"]);
const RESULTS = new Set(["success", "failed", "cancelled"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);
  const body = await req.json().catch(() => ({}));
  const page = Math.max(1, Math.trunc(Number(body.page) || 1));
  const pageSize = Math.min(100, Math.max(20, Math.trunc(Number(body.page_size) || 50)));
  const event = String(body.event_type || "all"), result = String(body.result || "all");
  const search = String(body.search || "").trim().replace(/[%_(),]/g, "").slice(0, 100);
  const supabase = serviceClient();
  let codeIds: string[] | null = null;
  if (search) {
    const { data } = await supabase.from("enterprise_activation_codes").select("id")
      .or(`company_name.ilike.%${search}%,key_hint.ilike.%${search}%`).limit(500);
    codeIds = (data || []).map((row) => row.id);
    if (!codeIds.length) return ok({ logs: [], page, page_size: pageSize, total: 0, total_pages: 1 }, req);
  }
  let query = supabase.from("enterprise_logs").select(
    "id,activation_code_id,event_type,result,conversation_count,message_count,export_format,client_version,error_code,detail,occurred_at",
    { count: "exact" },
  );
  if (EVENTS.has(event)) query = query.eq("event_type", event);
  if (RESULTS.has(result)) query = query.eq("result", result);
  if (codeIds) query = query.in("activation_code_id", codeIds);
  const { data: logs, error, count } = await query.order("occurred_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return fail("database error", 500, req);
  const ids = [...new Set((logs || []).map((row) => row.activation_code_id).filter(Boolean))];
  const { data: codes } = ids.length ? await supabase.from("enterprise_activation_codes")
    .select("id,key_hint,company_name,remark").in("id", ids) : { data: [] };
  const codeMap = new Map((codes || []).map((row) => [row.id, row]));
  const safeLogs = (logs || []).map((row) => {
    const code = codeMap.get(row.activation_code_id) || {};
    const detail = row.detail || {};
    return { id: row.id, event_type: row.event_type, result: row.result, occurred_at: row.occurred_at,
      conversation_count: row.conversation_count, message_count: row.message_count, export_format: row.export_format,
      client_version: row.client_version, error_code: row.error_code,
      key_hint: code.key_hint || detail.key_hint || null, company_name: code.company_name || null, remark: code.remark || null,
      admin_email: detail.admin_email || null, new_status: detail.new_status || null };
  });
  return ok({ logs: safeLogs, page, page_size: pageSize, total: count || 0, total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)) }, req);
});
