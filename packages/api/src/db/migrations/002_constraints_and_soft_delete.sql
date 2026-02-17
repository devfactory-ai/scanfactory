-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002: Foreign Key Constraints & Soft Deletes
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable foreign key enforcement (D1 has this off by default)
PRAGMA foreign_keys = ON;

-- ═══ SOFT DELETE SUPPORT ═══
-- Add deleted_at column to tables that need soft delete

-- Documents soft delete
ALTER TABLE documents ADD COLUMN deleted_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at);

-- Batches soft delete
ALTER TABLE batches ADD COLUMN deleted_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_deleted ON batches(deleted_at);

-- Users soft delete (already has active flag, add deleted_at for consistency)
ALTER TABLE users ADD COLUMN deleted_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted ON users(deleted_at);

-- Lookup entries soft delete
ALTER TABLE lookup_entries ADD COLUMN deleted_at TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_entries_deleted ON lookup_entries(deleted_at);

-- ═══ ADDITIONAL INDEXES FOR COMMON QUERIES ═══

-- Composite index for validation queue (most common query)
CREATE INDEX IF NOT EXISTS idx_documents_validation_queue
  ON documents(pipeline_id, status, confidence_score, created_at)
  WHERE deleted_at IS NULL;

-- Composite index for batch document listing
CREATE INDEX IF NOT EXISTS idx_documents_batch_status
  ON documents(batch_id, status, created_at)
  WHERE deleted_at IS NULL;

-- Index for active batches by pipeline
CREATE INDEX IF NOT EXISTS idx_batches_active
  ON batches(pipeline_id, status, opened_at)
  WHERE deleted_at IS NULL;

-- ═══ VIEWS FOR SOFT DELETE FILTERING ═══

-- Active documents view
CREATE VIEW IF NOT EXISTS active_documents AS
  SELECT * FROM documents WHERE deleted_at IS NULL;

-- Active batches view
CREATE VIEW IF NOT EXISTS active_batches AS
  SELECT * FROM batches WHERE deleted_at IS NULL;

-- Active users view
CREATE VIEW IF NOT EXISTS active_users AS
  SELECT * FROM users WHERE deleted_at IS NULL AND active = 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: D1 doesn't support ALTER TABLE to add FK constraints after creation
-- For new deployments, use schema_v2.sql with proper constraints
-- ═══════════════════════════════════════════════════════════════════════════
