CREATE TABLE IF NOT EXISTS cases (
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
);

CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created ON cases(created_at);
