-- ═══════════════════════════════════════════════════════════════════════════
-- ScanFactory D1 Database Schema v2
-- Includes: Foreign Key Constraints, Soft Deletes, Optimized Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable foreign key enforcement
PRAGMA foreign_keys = ON;

-- ═══ GENERIC PLATFORM TABLES ═══

-- Users (must be created first for FK references)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'consultant')),
  active INTEGER DEFAULT 1,
  deleted_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Document types / pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  ocr_schema TEXT NOT NULL,
  rule_steps TEXT NOT NULL,
  batch_config TEXT NOT NULL,
  field_display TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Batches (generic lots/bordereaux)
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  group_key TEXT,
  group_label TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'verified', 'exported', 'settled')),
  document_count INTEGER DEFAULT 0,
  export_r2_key TEXT,
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  exported_at TEXT,
  settled_at TEXT,
  settled_amount REAL,
  deleted_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_batches_pipeline
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
    ON DELETE RESTRICT
);

-- Processed documents
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  batch_id TEXT,
  scan_r2_key TEXT NOT NULL,
  filename TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected', 'exported')),
  raw_ocr_data TEXT,
  extracted_data TEXT NOT NULL,
  computed_data TEXT,
  confidence_score REAL,
  extraction_modes TEXT,
  anomalies TEXT,
  metadata TEXT,
  scanned_by TEXT,
  validated_by TEXT,
  validated_at TEXT,
  deleted_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_documents_pipeline
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_documents_batch
    FOREIGN KEY (batch_id) REFERENCES batches(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_documents_scanned_by
    FOREIGN KEY (scanned_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_documents_validated_by
    FOREIGN KEY (validated_by) REFERENCES users(id)
    ON DELETE SET NULL
);

-- Lookup tables
CREATE TABLE IF NOT EXISTS lookup_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pipeline_id TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_lookup_tables_pipeline
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lookup_entries (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  valid_from TEXT DEFAULT (date('now')),
  valid_to TEXT,
  deleted_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_lookup_entries_table
    FOREIGN KEY (table_id) REFERENCES lookup_tables(id)
    ON DELETE CASCADE
);

-- Audit trail
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'validate', 'reject', 'export', 'login', 'logout')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_audit_log_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- BULLETIN DE SOIN SPECIFIC TABLES
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
  company_id TEXT NOT NULL,
  policy_prefix TEXT,
  category TEXT,
  valid_from TEXT,
  valid_to TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_bs_contracts_company
    FOREIGN KEY (company_id) REFERENCES bs_companies(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bs_conditions (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  reimbursement_rate REAL NOT NULL,
  ceiling_per_act REAL,
  ceiling_annual REAL,
  waiting_days INTEGER DEFAULT 0,
  special_conditions TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  CONSTRAINT fk_bs_conditions_contract
    FOREIGN KEY (contract_id) REFERENCES bs_contracts(id)
    ON DELETE CASCADE
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

-- Document indexes
CREATE INDEX IF NOT EXISTS idx_documents_pipeline ON documents(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_documents_batch ON documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_scanned_by ON documents(scanned_by, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_confidence ON documents(confidence_score);
CREATE INDEX IF NOT EXISTS idx_documents_pipeline_status ON documents(pipeline_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at);

-- Composite index for validation queue (most common query)
CREATE INDEX IF NOT EXISTS idx_documents_validation_queue
  ON documents(pipeline_id, status, confidence_score, created_at);

-- Composite index for batch document listing
CREATE INDEX IF NOT EXISTS idx_documents_batch_status
  ON documents(batch_id, status, created_at);

-- Batch indexes
CREATE INDEX IF NOT EXISTS idx_batches_pipeline ON batches(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_pipeline_status ON batches(pipeline_id, status);
CREATE INDEX IF NOT EXISTS idx_batches_group_key ON batches(pipeline_id, group_key, status);
CREATE INDEX IF NOT EXISTS idx_batches_deleted ON batches(deleted_at);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_lookup_entries_table ON lookup_entries(table_id);
CREATE INDEX IF NOT EXISTS idx_lookup_entries_key ON lookup_entries(table_id, key);
CREATE INDEX IF NOT EXISTS idx_lookup_entries_deleted ON lookup_entries(deleted_at);

-- Pipeline-specific indexes
CREATE INDEX IF NOT EXISTS idx_bs_contracts_company ON bs_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_bs_conditions_contract ON bs_conditions(contract_id);
CREATE INDEX IF NOT EXISTS idx_bs_pct_medications_name ON bs_pct_medications(name_commercial);

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Active documents view (excludes soft-deleted)
CREATE VIEW IF NOT EXISTS active_documents AS
  SELECT * FROM documents WHERE deleted_at IS NULL;

-- Active batches view
CREATE VIEW IF NOT EXISTS active_batches AS
  SELECT * FROM batches WHERE deleted_at IS NULL;

-- Active users view
CREATE VIEW IF NOT EXISTS active_users AS
  SELECT * FROM users WHERE deleted_at IS NULL AND active = 1;
