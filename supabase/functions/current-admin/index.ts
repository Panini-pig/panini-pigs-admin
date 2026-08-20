import { fail, ok, preflight } from "../_shared/cors.ts";
import { getAdminUser, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  const admin = await getAdminUser(req);
  if (!admin) return fail("unauthorized", 401, req);

  const { data, error } = await serviceClient()
    .from("admin_profiles")
    .select("display_name")
    .eq("email", admin.email)
    .maybeSingle();

  if (error) return fail("profile unavailable", 503, req);
  return ok({ email: admin.email, display_name: data?.display_name || null }, req);
});
