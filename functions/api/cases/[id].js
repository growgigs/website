const UPDATABLE_FIELDS = ["status", "notes", "google_case_id", "follow_up_date"];

export async function onRequestPatch({ request, env, params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sets = [];
  const values = [];
  for (const key of UPDATABLE_FIELDS) {
    if (key in body) {
      sets.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (!sets.length) {
    return new Response(JSON.stringify({ ok: false, error: "No updatable fields provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(params.id);

  await env.DB.prepare(`UPDATE cases SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const row = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(params.id).first();
  if (!row) {
    return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  return Response.json({ ok: true, case: row });
}

export async function onRequestDelete({ env, params }) {
  await env.DB.prepare("DELETE FROM cases WHERE id = ?").bind(params.id).run();
  return Response.json({ ok: true });
}
