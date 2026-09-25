export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM cases ORDER BY created_at DESC"
  ).all();
  return Response.json({ ok: true, cases: results });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    client_name: body.client_name || "",
    reviewer_name: body.reviewer_name || "",
    review_text: body.review_text || "",
    business_category: body.business_category || "",
    matched_policy: body.matched_policy || "",
    policy_citation: body.policy_citation || "",
    report_text: body.report_text || "",
    status: body.status || "Drafted",
    google_case_id: body.google_case_id || "",
    notes: body.notes || "",
    follow_up_date: body.follow_up_date || "",
  };

  await env.DB.prepare(
    `INSERT INTO cases
      (id, created_at, updated_at, client_name, reviewer_name, review_text, business_category,
       matched_policy, policy_citation, report_text, status, google_case_id, notes, follow_up_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      record.id,
      record.created_at,
      record.updated_at,
      record.client_name,
      record.reviewer_name,
      record.review_text,
      record.business_category,
      record.matched_policy,
      record.policy_citation,
      record.report_text,
      record.status,
      record.google_case_id,
      record.notes,
      record.follow_up_date
    )
    .run();

  return Response.json({ ok: true, case: record }, { status: 201 });
}
