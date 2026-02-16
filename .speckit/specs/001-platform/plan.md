# Implementation Plan: ScanFactory

**Feature**: SPEC-001
**Date**: 2026-02-16

---

## Technical Context

| Dimension | Choice |
|---|---|
| Backend | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| File Storage | Cloudflare R2 |
| Cache | Cloudflare KV |
| Async | Cloudflare Queues |
| Frontend | React 18 + Tailwind + Cloudflare Pages |
| Mobile | React Native + Expo |
| OCR | DevFactory OCR Pipeline (external API) |
| Auth | Custom JWT + KV + OTP SMS (Twilio) |

---

## Project Structure

```
scanfactory/
├── CLAUDE.md
├── .speckit/
├── packages/
│   ├── api/                              # Backend: Cloudflare Workers + Hono
│   │   ├── src/
│   │   │   ├── index.ts                  # Hono app entry, router
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts               # JWT validation, role guard
│   │   │   │   └── cors.ts
│   │   │   ├── core/                     # Generic document processing engine
│   │   │   │   ├── extraction/
│   │   │   │   │   ├── adapter.ts        # DevFactory OCR client (Adapter pattern)
│   │   │   │   │   └── mapper.ts         # OCR JSON → document record
│   │   │   │   ├── pipeline/
│   │   │   │   │   ├── engine.ts         # Pipeline executor (runs rule steps in order)
│   │   │   │   │   ├── registry.ts       # Rule type registry
│   │   │   │   │   └── rules/            # Built-in rule types
│   │   │   │   │       ├── lookup.ts     # Generic lookup rule
│   │   │   │   │       ├── compute.ts    # Generic computation rule
│   │   │   │   │       ├── validate.ts   # Generic validation rule
│   │   │   │   │       └── anomaly.ts    # Generic anomaly detection
│   │   │   │   ├── validation/
│   │   │   │   │   ├── queue.ts          # Validation queue management
│   │   │   │   │   └── routes.ts
│   │   │   │   └── batches/
│   │   │   │       ├── lifecycle.ts      # Batch state machine
│   │   │   │       ├── export.ts         # Export document generation
│   │   │   │       └── routes.ts
│   │   │   ├── pipelines/                # Document-type-specific rule implementations
│   │   │   │   ├── bulletin_soin/
│   │   │   │   │   ├── rules.ts          # Healthcare-specific rules (reimbursement, PCT, etc.)
│   │   │   │   │   └── export.ts         # Bordereau PDF template
│   │   │   │   └── facture/
│   │   │   │       ├── rules.ts          # Invoice-specific rules (TVA, supplier matching)
│   │   │   │       └── export.ts         # Invoice export template
│   │   │   ├── admin/
│   │   │   │   ├── pipelines.ts          # CRUD pipelines + rule configs
│   │   │   │   ├── lookup-tables.ts      # CRUD reference data (companies, PCT, suppliers...)
│   │   │   │   ├── users.ts
│   │   │   │   └── routes.ts
│   │   │   ├── dashboard/
│   │   │   │   ├── stats.ts
│   │   │   │   └── routes.ts
│   │   │   ├── auth/
│   │   │   │   ├── jwt.ts
│   │   │   │   ├── otp.ts
│   │   │   │   └── routes.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.sql
│   │   │   │   └── migrations/
│   │   │   └── lib/
│   │   │       ├── audit.ts
│   │   │       └── errors.ts
│   │   ├── wrangler.toml
│   │   └── package.json
│   ├── web/                              # Frontend: React SPA
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── pages/
│   │   │   │   ├── Login.tsx
│   │   │   │   ├── Scan.tsx              # Upload + document type selection
│   │   │   │   ├── ValidationQueue.tsx
│   │   │   │   ├── ValidationDetail.tsx  # Split-screen (generic for all types)
│   │   │   │   ├── Batches.tsx
│   │   │   │   ├── BatchDetail.tsx
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   └── admin/
│   │   │   │       ├── Pipelines.tsx
│   │   │   │       ├── LookupTables.tsx
│   │   │   │       └── Users.tsx
│   │   │   ├── components/
│   │   │   │   ├── DocumentForm.tsx      # Auto-generated from schema fields
│   │   │   │   ├── ScanViewer.tsx
│   │   │   │   ├── ConfidenceBadge.tsx
│   │   │   │   ├── DataTable.tsx
│   │   │   │   └── FileUpload.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useValidationQueue.ts
│   │   │   │   └── useKeyboardNav.ts
│   │   │   └── lib/api.ts
│   │   └── package.json
│   └── mobile/
│       ├── app/
│       │   ├── (tabs)/
│       │   │   ├── scan.tsx
│       │   │   ├── history.tsx
│       │   │   └── profile.tsx
│       │   └── _layout.tsx
│       ├── components/DocumentScanner.tsx
│       └── lib/
│           ├── api.ts
│           └── offline.ts
├── schemas/                              # OCR extraction schemas
│   ├── bulletin_soin.json
│   └── efactura_tn.json                  # (future: invoice schema)
└── tests/
    ├── unit/
    │   ├── extraction.test.ts
    │   ├── pipeline.test.ts
    │   ├── batches.test.ts
    │   └── bulletin_soin.rules.test.ts
    ├── integration/
    │   └── api.test.ts
    └── fixtures/
        ├── bulletin_sample.json
        ├── facture_sample.json
        └── pipeline_configs.json
```

---

## Database Schema (D1)

```sql
-- ═══ GENERIC PLATFORM TABLES ═══

-- Document types / pipelines
CREATE TABLE pipelines (
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
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT REFERENCES pipelines(id),
  batch_id TEXT REFERENCES batches(id),
  scan_r2_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending',          -- pending | validated | rejected | exported
  raw_ocr_data TEXT,                      -- JSON: full OCR response
  extracted_data TEXT NOT NULL,            -- JSON: final validated data
  computed_data TEXT,                      -- JSON: fields computed by pipeline rules
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
CREATE TABLE batches (
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
CREATE TABLE lookup_tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- "companies", "pct_medications", "suppliers"
  pipeline_id TEXT REFERENCES pipelines(id),  -- NULL = shared across pipelines
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE lookup_entries (
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
CREATE TABLE users (
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
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ BULLETIN DE SOIN SPECIFIC TABLES ═══
-- (Pipeline-specific tables for healthcare use case)

CREATE TABLE bs_companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  lot_max_bulletins INTEGER DEFAULT 50,
  lot_max_days INTEGER DEFAULT 7,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bs_contracts (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES bs_companies(id),
  policy_prefix TEXT,
  category TEXT,
  valid_from TEXT,
  valid_to TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE bs_conditions (
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

CREATE TABLE bs_pct_medications (
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

CREATE TABLE bs_practitioners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  specialty TEXT,
  cnam_code TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ═══ INDEXES ═══
CREATE INDEX idx_documents_pipeline ON documents(pipeline_id);
CREATE INDEX idx_documents_batch ON documents(batch_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_batches_pipeline ON batches(pipeline_id);
CREATE INDEX idx_batches_status ON batches(status);
CREATE INDEX idx_lookup_entries_table ON lookup_entries(table_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
```

---

## Pipeline Engine Architecture

```
Document Upload
      │
      ▼
  Select Pipeline (document type)
      │
      ▼
  OCR Adapter → DevFactory API (schema from pipeline config)
      │
      ▼
  Mapper → Normalize extracted data
      │
      ▼
  Pipeline Engine → Execute rule_steps[] in order
      │
      ├─ Step 1: lookup (e.g., find company)
      ├─ Step 2: compute (e.g., reimbursement)
      ├─ Step 3: validate (e.g., ceiling check)
      └─ Step 4: anomaly (e.g., duplicate)
      │
      ▼
  Store: D1 document + R2 scan + assign to batch
      │
      ▼
  Validation Queue → Operator reviews
      │
      ▼
  Batch → Auto-close → Export → Settle
```

**Rule step interface** (all rule types implement this):
```typescript
interface RuleStep {
  type: string;                  // "lookup" | "compute" | "validate" | "anomaly"
  execute(doc: Document, config: any, ctx: PipelineContext): Promise<RuleResult>;
}
```

**PipelineContext** provides access to D1, R2, KV, and pipeline-specific lookup tables.

---

## Implementation Phases

### Phase 1 — POC (3 weeks)
Core platform + bulletin de soin extraction + basic validation.
**Gate**: >85% extraction accuracy on 50 real bulletins.

### Phase 2 — MVP (7 weeks)
Full pipeline for bulletin de soin: rules engine, batches, complete validation UI, mobile app.
**Gate**: End-to-end pipeline for 1 insurance company.

### Phase 3 — Production (7 weeks)
Multi-pipeline support, admin UI, dashboard, 5 insurance companies, production deployment.
**Gate**: 5 companies configured, second pipeline (facture) configurable.

---

## Environment & Bindings

| Binding/Var | Type | Purpose |
|---|---|---|
| `DB` | D1 | Main database |
| `SCANS` | R2 | Document scan storage |
| `EXPORTS` | R2 | Generated export documents |
| `CACHE` | KV | Sessions, config cache |
| `DOC_QUEUE` | Queue | Async document processing |
| `OCR_API_URL` | var | DevFactory OCR Pipeline URL |
| `OCR_API_KEY` | secret | OCR API key |
| `JWT_SECRET` | secret | JWT signing |
| `TWILIO_*` | secrets | SMS OTP |
