import { verifySession } from "../_lib/auth.js";

const PUBLIC_PATHS = new Set(["/api/login", "/api/logout"]);

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (PUBLIC_PATHS.has(url.pathname)) {
    return next();
  }
  const ok = await verifySession(request, env.SESSION_SECRET);
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return next();
}
