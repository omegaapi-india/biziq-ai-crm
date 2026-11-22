CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  intent TEXT NOT NULL,
  score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  tags TEXT NOT NULL DEFAULT '[]',
  next_action TEXT,
  note TEXT,
  model_provider TEXT NOT NULL DEFAULT 'rules',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'bot',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON activities(lead_id);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  result TEXT NOT NULL,
  revenue REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outcomes_lead_id ON outcomes(lead_id);

CREATE TABLE IF NOT EXISTS learning (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_runs (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);
