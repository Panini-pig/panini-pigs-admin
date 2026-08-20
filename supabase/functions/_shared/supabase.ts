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

export type AdminUser = { id: string; email: string };

export async function getAdminUser(req: Request): Promise<AdminUser | null> {
  const allowedEmails = (Deno.env.get("ADMIN_EMAILS") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token || allowedEmails.length === 0) return null;

  const { data, error } = await serviceClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !email || !allowedEmails.includes(email)) return null;
  return { id: data.user.id, email };
}

export async function requireAdmin(req: Request): Promise<boolean> {
  return Boolean(await getAdminUser(req));
}

export async function verifyAdminPassword(
  admin: AdminUser,
  password: string,
): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey || !password) return false;

  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ email: admin.email, password }),
  });
  const session = await response.json().catch(() => ({}));
  const verifiedEmail = String(session?.user?.email || "").toLowerCase();
  return response.ok && session?.user?.id === admin.id && verifiedEmail === admin.email;
}
