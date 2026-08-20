const defaultAllowedOrigins = ["https://admin.panini-pigs.cn"];

function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") || defaultAllowedOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(req?: Request): HeadersInit {
  const origin = req?.headers.get("origin") || "";
  const isAllowed = origin && allowedOrigins().includes(origin);
  return {
    ...(isAllowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(req),
    },
  });
}

export function ok(data: unknown, req?: Request): Response {
  return json({ ok: true, ...data }, 200, req);
}

export function fail(message: string, status = 400, req?: Request): Response {
  return json({ ok: false, error: message }, status, req);
}

export function preflight(req: Request): Response {
  return new Response("ok", {
    headers: {
      "Content-Type": "text/plain",
      ...corsHeaders(req),
    },
  });
}
