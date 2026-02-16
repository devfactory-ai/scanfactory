-- ═══════════════════════════════════════════════════════════════════════════
-- ScanFactory D1 Database Schema
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ GENERIC PLATFORM TABLES ═══

-- Document types / pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,              -- "bulletin_soin", "facture"
  display_name TEXT NOT NULL,             -- "Bulletin de Soin", "Facture"
  description TEXT,
  ocr_schema TEXT NOT NULL,               -- Schema name for DevFactory OCR
  rule_steps TEXT NOT NULL,               -- JSON: ordered list of rule steps
  batch_config TEXT NOT NULL,             -- JSON: {group_by, max_count, max_days, export_template}
  field_display TEXT,                     -- JSON: field ordering/grouping for validation UI
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Processed documents (generic — works for any document type)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES pipelines(id),
  batch_id TEXT REFERENCES batches(id),
  scan_r2_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending',          -- pending | validated | rejected | exported
  raw_ocr_data TEXT,                      -- JSON: full OCR response
  extracted_data TEXT NOT NULL,           -- JSON: final validated data
  computed_data TEXT,                     -- JSON: fields computed by pipeline rules
  confidence_score REAL,
  extraction_modes TEXT,                  -- JSON: {replace:[], table:[], direct:[]}
  anomalies TEXT,                         -- JSON: [{type, message, severity}]
  metadata TEXT,                          -- JSON: pipeline-specific metadata
  scanned_by TEXT REFERENCES users(id),
  validated_by TEXT REFERENCES users(id),
  validated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Batches (generic lots/bordereaux)
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES pipelines(id),
  group_key TEXT,                          -- Grouping value (company_id, supplier_id, etc.)
  group_label TEXT,                        -- Human-readable (company name, supplier name)
  status TEXT DEFAULT 'open',             -- open | closed | verified | exported | settled
  document_count INTEGER DEFAULT 0,
  export_r2_key TEXT,
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  exported_at TEXT,
  settled_at TEXT,
  settled_amount REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Lookup tables (generic reference data used by pipeline rules)
CREATE TABLE IF NOT EXISTS lookup_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- "companies", "pct_medications", "suppliers"
  pipeline_id TEXT REFERENCES pipelines(id),  -- NULL = shared across pipelines
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lookup_entries (
  id TEXT PRIMARY KEY,
  table_id TEXT REFERENCES lookup_tables(id),
  key TEXT NOT NULL,                      -- Lookup key
  data TEXT NOT NULL,                     -- JSON: entry data
  active INTEGER DEFAULT 1,
  valid_from TEXT DEFAULT (date('now')),
  valid_to TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,                     -- admin | operator | consultant
  phone TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- BULLETIN DE SOIN SPECIFIC TABLES
-- (Pipeline-specific tables for healthcare use case)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bs_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  lot_max_bulletins INTEGER DEFAULT 50,
  lot_max_days INTEGER DEFAULT 7,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bs_contracts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES bs_companies(id),
  policy_prefix TEXT,
  category TEXT,
  valid_from TEXT,
  valid_to TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bs_conditions (
  id TEXT PRIMARY KEY,
  contract_id TEXT REFERENCES bs_contracts(id),
  service_type TEXT NOT NULL,
  reimbursement_rate REAL NOT NULL,
  ceiling_per_act REAL,
  ceiling_annual REAL,
  waiting_days INTEGER DEFAULT 0,
  special_conditions TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bs_pct_medications (
  id TEXT PRIMARY KEY,
  name_commercial TEXT NOT NULL,
  dci TEXT,
  dosage TEXT,
  price_ttc REAL NOT NULL,
  therapeutic_class TEXT,
  valid_from TEXT DEFAULT (date('now')),
  valid_to TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bs_practitioners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  cnam_code TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_documents_pipeline ON documents(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_documents_batch ON documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_batches_pipeline ON batches(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_lookup_entries_table ON lookup_entries(table_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_bs_contracts_company ON bs_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_bs_conditions_contract ON bs_conditions(contract_id);
