import { fail, ok, preflight } from "../_shared/cors.ts";
import { requireAdmin, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (!(await requireAdmin(req))) return fail("unauthorized", 401, req);

  const { data, error } = await serviceClient().rpc("admin_dashboard_stats");
  if (error || !data) return fail("statistics unavailable", 503, req);
  return ok({ stats: data }, req);
});
