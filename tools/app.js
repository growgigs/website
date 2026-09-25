import { API_BASE } from "./api-config.js";

const STATUS_OPTIONS = ["Drafted", "Submitted", "Under Review", "Removed", "Rejected", "Escalated"];

const formEl = document.getElementById("report-form");
const resultEl = document.getElementById("report-result");
const trackerBody = document.getElementById("tracker-body");
const trackerTable = document.getElementById("tracker-table");
const trackerEmpty = document.getElementById("tracker-empty");

const businessInput = document.getElementById("business-name");
const reviewerInput = document.getElementById("reviewer-name");
const reviewUrlInput = document.getElementById("review-url");
const profileUrlInput = document.getElementById("reviewer-profile-url");
const commentsInput = document.getElementById("comments");
const analyzeBtn = document.getElementById("analyze-btn");
const analyzeStatus = document.getElementById("analyze-status");

/* ---------- Auth gate ---------- */
// This page is static (no server-side gate is possible on this hosting
// setup), so access control happens client-side: no valid token, no data.
// The page itself has no sensitive content; the API refuses requests
// without a valid token regardless.
const authToken = localStorage.getItem("gg_tools_token");
if (!authToken) {
  window.location.href = "/tools-login.html";
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${authToken}`, ...extra };
}

/* ---------- Logout ---------- */
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("gg_tools_token");
  window.location.href = "/tools-login.html";
});

/* ---------- Analyze ---------- */
analyzeBtn.addEventListener("click", async () => {
  const payload = {
    business_name: businessInput.value.trim(),
    reviewer_name: reviewerInput.value.trim(),
    review_url: reviewUrlInput.value.trim(),
    reviewer_profile_url: profileUrlInput.value.trim(),
    comments: commentsInput.value.trim(),
  };

  if (!payload.comments) {
    analyzeStatus.textContent = "Paste the review text or describe the situation first.";
    return;
  }

  analyzeBtn.disabled = true;
  analyzeStatus.textContent = "Analyzing...";
  resultEl.hidden = true;

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    analyzeBtn.disabled = false;
    analyzeStatus.textContent = "";

    if (!res.ok || !data.ok) {
      analyzeStatus.textContent = data.error || "Analysis failed. Try again.";
      return;
    }

    if (!data.matched) {
      showNoMatch(data.reasoning, payload);
      return;
    }

    showMatch(data, payload);
  } catch {
    analyzeBtn.disabled = false;
    analyzeStatus.textContent = "Analysis failed. Check your connection and try again.";
  }
});

function showNoMatch(reasoning, payload) {
  resultEl.hidden = false;
  resultEl.innerHTML = `
    <div class="match-banner">
      <div class="label">No clear policy match</div>
      <div class="summary">${escapeHtml(reasoning || "This doesn't clearly violate one of Google's removal policies based on what was given.")} It may still be worth a professional response instead of a removal request.</div>
    </div>
    <button class="btn-outline" id="new-report-btn" type="button">Start Another Report</button>
  `;
  document.getElementById("new-report-btn").addEventListener("click", resetForm);
}

/* ---------- Report result ---------- */
function showMatch(data, payload) {
  resultEl.hidden = false;
  let reportDirty = false;

  resultEl.innerHTML = `
    <div class="match-banner">
      <div class="label">${escapeHtml(data.policy_label)}</div>
      <div class="summary">${escapeHtml(data.reasoning || "")}</div>
    </div>

    <div class="field-group">
      <label for="report-text">Draft Report Text (edit freely before submitting)</label>
      <textarea id="report-text">${escapeHtml(data.report_text || "")}</textarea>
    </div>

    <div class="field-group">
      <label>Evidence Checklist</label>
      <ul class="evidence-list">
        ${(data.evidence_checklist || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>

    <div class="submit-guidance">
      <strong>How to submit:</strong> Open the review, use the three-dot menu, and choose "Report review". ${escapeHtml(data.submit_guidance || "")} This does not guarantee removal.
    </div>

    <div class="result-actions">
      <button class="btn" id="save-case-btn" type="button">Save to Tracker</button>
      <button class="btn-outline" id="new-report-btn" type="button">Start Another Report</button>
    </div>
    <p id="save-status" style="margin-top:10px; font-size:0.85rem;"></p>
  `;

  const reportText = document.getElementById("report-text");
  reportText.addEventListener("input", () => {
    reportDirty = true;
  });

  document.getElementById("new-report-btn").addEventListener("click", resetForm);

  document.getElementById("save-case-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("save-status");
    statusEl.textContent = "Saving...";
    try {
      const res = await fetch(`${API_BASE}/cases`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          client_name: payload.business_name,
          reviewer_name: payload.reviewer_name,
          review_text: payload.comments,
          review_url: payload.review_url,
          reviewer_profile_url: payload.reviewer_profile_url,
          matched_policy: data.policy_label,
          policy_citation: data.policy_key,
          report_text: reportText.value,
          status: "Drafted",
        }),
      });
      const resData = await res.json();
      if (res.ok && resData.ok) {
        statusEl.textContent = "Saved to tracker.";
        addCaseRow(resData.case);
      } else {
        statusEl.textContent = resData.error || "Failed to save.";
      }
    } catch {
      statusEl.textContent = "Failed to save. Check your connection.";
    }
  });
}

function resetForm() {
  businessInput.value = "";
  reviewerInput.value = "";
  reviewUrlInput.value = "";
  profileUrlInput.value = "";
  commentsInput.value = "";
  resultEl.hidden = true;
  resultEl.innerHTML = "";
  analyzeStatus.textContent = "";
}

/* ---------- Case tracker ---------- */
async function loadCases() {
  try {
    const res = await fetch(`${API_BASE}/cases`, { headers: authHeaders() });
    const data = await res.json();
    if (res.ok && data.ok) {
      data.cases.forEach(addCaseRow);
    }
  } catch {
    // tracker stays empty on failure; report builder still works
  }
}

function addCaseRow(c) {
  trackerEmpty.hidden = true;
  trackerTable.hidden = false;

  const row = document.createElement("tr");
  row.dataset.id = c.id;
  const links = [
    c.review_url ? `<a href="${escapeHtml(c.review_url)}" target="_blank" rel="noopener">Review ↗</a>` : "",
    c.reviewer_profile_url
      ? `<a href="${escapeHtml(c.reviewer_profile_url)}" target="_blank" rel="noopener">Profile ↗</a>`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  row.innerHTML = `
    <td class="client-cell">
      ${escapeHtml(c.client_name || "—")}
      <div class="reviewer">${escapeHtml(c.reviewer_name || "")}</div>
      ${links ? `<div class="reviewer">${links}</div>` : ""}
      <button class="view-btn" type="button">View report</button>
    </td>
    <td>${escapeHtml(c.matched_policy || "—")}</td>
    <td>
      <select class="status-select">
        ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </td>
    <td><input type="text" class="case-id-input" value="${escapeHtml(c.google_case_id || "")}"></td>
    <td><input type="date" class="followup-input" value="${escapeHtml(c.follow_up_date || "")}"></td>
    <td><input type="text" class="notes-input" value="${escapeHtml(c.notes || "")}"></td>
    <td><button class="delete-btn" type="button">Delete</button></td>
  `;
  trackerBody.prepend(row);

  row.querySelector(".status-select").addEventListener("change", (e) => {
    updateCase(c.id, { status: e.target.value });
  });
  row.querySelector(".case-id-input").addEventListener("change", (e) => {
    updateCase(c.id, { google_case_id: e.target.value });
  });
  row.querySelector(".followup-input").addEventListener("change", (e) => {
    updateCase(c.id, { follow_up_date: e.target.value });
  });
  row.querySelector(".notes-input").addEventListener("change", (e) => {
    updateCase(c.id, { notes: e.target.value });
  });
  row.querySelector(".delete-btn").addEventListener("click", async () => {
    if (!confirm("Delete this case? This can't be undone.")) return;
    await fetch(`${API_BASE}/cases/${c.id}`, { method: "DELETE", headers: authHeaders() });
    row.nextElementSibling?.classList.contains("tracker-detail-row") && row.nextElementSibling.remove();
    row.remove();
    if (!trackerBody.children.length) {
      trackerTable.hidden = true;
      trackerEmpty.hidden = false;
    }
  });
  row.querySelector(".view-btn").addEventListener("click", () => {
    const existing = row.nextElementSibling;
    if (existing && existing.classList.contains("tracker-detail-row")) {
      existing.remove();
      return;
    }
    const detail = document.createElement("tr");
    detail.className = "tracker-detail-row";
    detail.innerHTML = `<td colspan="7"><strong>Review text / comments:</strong>\n${escapeHtml(c.review_text || "—")}\n\n<strong>Report text:</strong>\n${escapeHtml(c.report_text || "—")}</td>`;
    row.after(detail);
  });
}

async function updateCase(id, patch) {
  try {
    await fetch(`${API_BASE}/cases/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
  } catch {
    // best-effort; the field stays visually updated for this session
  }
}

/* ---------- Utilities ---------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- Init ---------- */
loadCases();
