import { makeSessionCookie } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  if (!env.TOOLS_PASSWORD || !env.SESSION_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "Tool is not configured yet. Set TOOLS_PASSWORD and SESSION_SECRET." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body.password !== "string" || body.password !== env.TOOLS_PASSWORD) {
    return new Response(JSON.stringify({ ok: false, error: "Incorrect password" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cookie = await makeSessionCookie(env.SESSION_SECRET);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}
