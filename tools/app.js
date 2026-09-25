import { POLICIES, QUESTIONS, matchPolicy } from "./policies.js";
import { API_BASE } from "./api-config.js";

const STATUS_OPTIONS = ["Drafted", "Submitted", "Under Review", "Removed", "Rejected", "Escalated"];

const questionnaireEl = document.getElementById("questionnaire");
const resultEl = document.getElementById("report-result");
const trackerBody = document.getElementById("tracker-body");
const trackerTable = document.getElementById("tracker-table");
const trackerEmpty = document.getElementById("tracker-empty");

let answers = {};
let currentIndex = 0;
let currentMatch = null; // { questionId, policyKey, policy }
let reportDirty = false;

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

/* ---------- Questionnaire ---------- */
function renderQuestionnaire() {
  resultEl.hidden = true;
  resultEl.innerHTML = "";

  if (currentIndex >= QUESTIONS.length) {
    questionnaireEl.innerHTML = `
      <div class="match-banner">
        <div class="label">No clear policy match</div>
        <div class="summary">Based on your answers, this review doesn't clearly violate one of Google's removal policies. It may still be worth a professional response instead of a removal request — see our guide on responding to negative reviews.</div>
      </div>
      <button class="btn-outline q-restart" id="restart-btn">Start Over</button>
    `;
    document.getElementById("restart-btn").addEventListener("click", resetQuestionnaire);
    return;
  }

  const q = QUESTIONS[currentIndex];
  questionnaireEl.innerHTML = `
    <div class="q-item">
      <div class="q-text">${escapeHtml(q.text)}</div>
      <div class="q-choices">
        <button type="button" data-answer="yes">Yes</button>
        <button type="button" data-answer="no">No</button>
      </div>
    </div>
    <button class="btn-outline q-restart" id="restart-btn">Start Over</button>
  `;

  questionnaireEl.querySelectorAll(".q-choices button").forEach((btn) => {
    btn.addEventListener("click", () => {
      answers[q.id] = btn.dataset.answer;
      const match = matchPolicy(answers);
      if (match) {
        currentMatch = match;
        showMatch(match);
      } else {
        currentIndex += 1;
        renderQuestionnaire();
      }
    });
  });

  document.getElementById("restart-btn").addEventListener("click", resetQuestionnaire);
}

function resetQuestionnaire() {
  answers = {};
  currentIndex = 0;
  currentMatch = null;
  reportDirty = false;
  renderQuestionnaire();
}

/* ---------- Report builder ---------- */
function showMatch(match) {
  questionnaireEl.innerHTML = "";
  resultEl.hidden = false;

  const policy = match.policy;
  resultEl.innerHTML = `
    <div class="match-banner">
      <div class="label">${escapeHtml(policy.label)}</div>
      <div class="summary">${escapeHtml(policy.summary)}</div>
    </div>

    <div class="field-group">
      <label for="business-name">Client / Business Name</label>
      <input type="text" id="business-name" placeholder="e.g. Acme Plumbing">
    </div>
    <div class="field-group">
      <label for="reviewer-name">Reviewer Name (if known)</label>
      <input type="text" id="reviewer-name">
    </div>
    <div class="field-group">
      <label for="specific-facts">Specific facts for this case</label>
      <textarea id="specific-facts" placeholder="e.g. No record of this name or details in our booking system for the stated dates."></textarea>
    </div>

    <div class="field-group">
      <label for="report-text">Draft Report Text (edit freely before submitting)</label>
      <textarea id="report-text"></textarea>
    </div>
    <button class="btn-outline" id="regen-btn" type="button" style="margin-bottom:18px;">Reset to Template</button>

    <div class="field-group">
      <label>Evidence Checklist</label>
      <ul class="evidence-list">
        ${policy.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>

    <div class="submit-guidance">
      <strong>How to submit:</strong> Open the review on Google Maps or in Google Business Profile, use the three-dot menu on that specific review, and choose the option to flag/report it. If the flag option doesn't resolve it, escalate through Google Business Profile's Help/Support chat and reference the specific policy above by name rather than describing it generically. This does not guarantee removal.
    </div>

    <div class="result-actions">
      <button class="btn" id="save-case-btn" type="button">Save to Tracker</button>
      <button class="btn-outline" id="new-report-btn" type="button">Start Another Report</button>
    </div>
    <p id="save-status" style="margin-top:10px; font-size:0.85rem;"></p>
  `;

  const businessInput = document.getElementById("business-name");
  const reviewerInput = document.getElementById("reviewer-name");
  const factsInput = document.getElementById("specific-facts");
  const reportText = document.getElementById("report-text");

  function regenerate() {
    reportText.value = policy.reportTemplate({
      businessName: businessInput.value.trim(),
      reviewerName: reviewerInput.value.trim(),
      specificFacts: factsInput.value.trim(),
    });
    reportDirty = false;
  }
  regenerate();

  [businessInput, reviewerInput, factsInput].forEach((el) => {
    el.addEventListener("input", () => {
      if (!reportDirty) regenerate();
    });
  });
  reportText.addEventListener("input", () => {
    reportDirty = true;
  });
  document.getElementById("regen-btn").addEventListener("click", regenerate);

  document.getElementById("new-report-btn").addEventListener("click", resetQuestionnaire);

  document.getElementById("save-case-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("save-status");
    statusEl.textContent = "Saving...";
    try {
      const res = await fetch(`${API_BASE}/cases`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          client_name: businessInput.value.trim(),
          reviewer_name: reviewerInput.value.trim(),
          review_text: factsInput.value.trim(),
          matched_policy: policy.label,
          policy_citation: match.policyKey,
          report_text: reportText.value,
          status: "Drafted",
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        statusEl.textContent = "Saved to tracker.";
        addCaseRow(data.case);
      } else {
        statusEl.textContent = data.error || "Failed to save.";
      }
    } catch {
      statusEl.textContent = "Failed to save. Check your connection.";
    }
  });
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
  row.innerHTML = `
    <td class="client-cell">
      ${escapeHtml(c.client_name || "—")}
      <div class="reviewer">${escapeHtml(c.reviewer_name || "")}</div>
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
    detail.innerHTML = `<td colspan="7"><strong>Facts on record:</strong>\n${escapeHtml(c.review_text || "—")}\n\n<strong>Report text:</strong>\n${escapeHtml(c.report_text || "—")}</td>`;
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
renderQuestionnaire();
loadCases();
