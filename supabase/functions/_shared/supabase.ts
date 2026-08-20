import { createClient } from "npm:@supabase/supabase-js@2";

export function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase env not configured");
  }
  return createClient(url, key);
}

export async function requireAdmin(req: Request): Promise<boolean> {
  const allowedEmails = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token || allowedEmails.length === 0) return false;

  const { data, error } = await serviceClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  return !error && Boolean(email && allowedEmails.includes(email));
}
