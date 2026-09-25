import { verifySession } from "../_lib/auth.js";

export async function onRequest({ request, env, next }) {
  const ok = await verifySession(request, env.SESSION_SECRET);
  if (!ok) {
    const url = new URL(request.url);
    return Response.redirect(new URL("/tools-login.html", url.origin), 302);
  }
  return next();
}
