/*
 * Standalone Cloudflare Worker for the internal Review Report Tool.
 * Deployed separately from the main growgigs.io Worker (which can't
 * take a D1 binding in its current form). This Worker only serves the
 * /login, /cases, and /cases/:id JSON API — the static pages
 * (tools/index.html, tools-login.html) stay on growgigs.io and call
 * this Worker's URL directly, with a token in the Authorization
 * header instead of a cookie (simpler across two different origins).
 *
 * Requires two bindings on this Worker, set in Cloudflare:
 *   - D1 database binding named "DB" -> website-db
 *   - Secret "TOOLS_PASSWORD" (the login password)
 *   - Secret "SESSION_SECRET" (any random string, signs tokens)
 *
 * Update ALLOWED_ORIGIN below only if growgigs.io ever changes.
 */

const ALLOWED_ORIGIN = "https://growgigs.io";
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const UPDATABLE_FIELDS = ["status", "notes", "google_case_id", "follow_up_date"];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function makeToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const sig = await hmacHex(secret, String(exp));
  return `${exp}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(secret, expStr);
  return timingSafeEqual(expected, sig);
}

function getBearer(request) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

async function requireAuth(request, env) {
  return verifyToken(getBearer(request), env.SESSION_SECRET);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/login" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Bad request" }, 400);
      }
      if (typeof body.password !== "string" || body.password !== env.TOOLS_PASSWORD) {
        return json({ ok: false, error: "Incorrect password" }, 401);
      }
      const token = await makeToken(env.SESSION_SECRET);
      return json({ ok: true, token });
    }

    if (!(await requireAuth(request, env))) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    // One-time (idempotent) table setup, run via a single authenticated
    // POST instead of requiring local CLI/wrangler access.
    if (url.pathname === "/migrate" && request.method === "POST") {
      await env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS cases (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          client_name TEXT,
          reviewer_name TEXT,
          review_text TEXT,
          business_category TEXT,
          matched_policy TEXT,
          policy_citation TEXT,
          report_text TEXT,
          status TEXT NOT NULL DEFAULT 'Drafted',
          google_case_id TEXT,
          notes TEXT,
          follow_up_date TEXT
        )`
      ).run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status)").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at)").run();
      return json({ ok: true, migrated: true });
    }

    if (url.pathname === "/cases" && request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM cases ORDER BY created_at DESC").all();
      return json({ ok: true, cases: results });
    }

    if (url.pathname === "/cases" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Bad request" }, 400);
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
      return json({ ok: true, case: record }, 201);
    }

    const caseMatch = url.pathname.match(/^\/cases\/([^/]+)$/);

    if (caseMatch && request.method === "PATCH") {
      const id = caseMatch[1];
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "Bad request" }, 400);
      }
      const sets = [];
      const values = [];
      for (const key of UPDATABLE_FIELDS) {
        if (key in body) {
          sets.push(`${key} = ?`);
          values.push(body[key]);
        }
      }
      if (!sets.length) return json({ ok: false, error: "No updatable fields provided" }, 400);
      sets.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(id);
      await env.DB.prepare(`UPDATE cases SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...values)
        .run();
      const row = await env.DB.prepare("SELECT * FROM cases WHERE id = ?").bind(id).first();
      if (!row) return json({ ok: false, error: "Not found" }, 404);
      return json({ ok: true, case: row });
    }

    if (caseMatch && request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM cases WHERE id = ?").bind(caseMatch[1]).run();
      return json({ ok: true });
    }

    return json({ ok: false, error: "Not found" }, 404);
  },
};
