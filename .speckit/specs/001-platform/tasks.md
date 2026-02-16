# Tasks: ScanFactory

**Feature**: SPEC-001
**Total Tasks**: 44
**Phases**: POC (3 weeks) → MVP (7 weeks) → Production (7 weeks)

---

## Phase 1 — POC: Core Platform + Bulletin de Soin Extraction

> Goal: Scan a document → AI extraction → validate → save
> Gate: >85% field accuracy on 50 real bulletins de soin

### Infrastructure (M8)

#### T001: Initialize monorepo and Cloudflare project
**Files**: `packages/api/package.json`, `packages/api/wrangler.toml`, `packages/api/tsconfig.json`, `packages/web/package.json`, `packages/web/vite.config.ts`, root `package.json`
**Action**: Monorepo. API: Hono + wrangler with D1 (DB), R2 (SCANS, EXPORTS), KV (CACHE), Queue (DOC_QUEUE). Web: Vite + React 18 + Tailwind + react-router-dom + @tanstack/react-query. TypeScript strict.
**Commit**: `feat(infra): T001 - monorepo + cloudflare init`

#### T002: Create D1 schema and seed data
**Files**: `packages/api/src/db/schema.sql`, `packages/api/src/db/seed.sql`
**Action**: Full schema: pipelines, documents, batches, lookup_tables, lookup_entries, users, audit_log + bs_companies, bs_contracts, bs_conditions, bs_pct_medications, bs_practitioners + all indexes. Seed: pipeline "bulletin_soin" with rule_steps and batch_config, 2 test companies (STAR, GAT) with contracts/conditions, 5 PCT medications, 3 practitioners, 1 admin + 1 operator user.
**Commit**: `feat(infra): T002 - D1 schema + seed`
**Validation**: QS-1

#### T003: Hono app skeleton with auth
**Files**: `packages/api/src/index.ts`, `src/middleware/auth.ts`, `src/middleware/cors.ts`, `src/lib/errors.ts`, `src/auth/jwt.ts`, `src/auth/routes.ts`
**Action**: Hono app, CORS, JWT auth middleware (KV), role guard, error handler. POST /api/auth/login, /refresh. JWT in KV 24h TTL.
**Commit**: `feat(infra): T003 - Hono + auth`

#### T004: Audit trail helper
**File**: `packages/api/src/lib/audit.ts`
**Action**: `logAudit(db, userId, action, entityType, entityId, oldValue, newValue)`. ULID id.
**Commit**: `feat(infra): T004 - audit trail`

### Core: Extraction

#### T005: OCR Adapter (DevFactory client)
**File**: `packages/api/src/core/extraction/adapter.ts`
**Action**: `OCRAdapter` class. `extract(image: ArrayBuffer, schema: string): Promise<ExtractionResult>`. Posts to DevFactory OCR `/extract`. Retry 3x exponential backoff. Schema name comes from pipeline config.
**Commit**: `feat(core): T005 - OCR adapter`

#### T006: Document mapper
**File**: `packages/api/src/core/extraction/mapper.ts`
**Action**: `mapOCRToDocument(ocrResult, pipeline)`: normalize dates (ISO), numbers, clean arrays. Preserve confidence + extraction_modes. Generic — works for any schema.
**Commit**: `feat(core): T006 - document mapper`

#### T007: Scan endpoint + document creation
**File**: `packages/api/src/core/extraction/routes.ts` (mounted under core routes)
**Action**: POST /api/documents/scan. Accept multipart (file + pipeline name). Load pipeline config from D1. Call OCR adapter with pipeline.ocr_schema. Map result. Create document in D1 (status=pending). Store scan in R2. Queue for pipeline processing. Auto-assign to batch based on pipeline.batch_config.group_by.
**Commit**: `feat(core): T007 - scan endpoint`
**Validation**: QS-2

### Core: Validation (Basic)

#### T008: Validation queue API
**Files**: `packages/api/src/core/validation/queue.ts`, `routes.ts`
**Action**: GET /api/validation/queue (paginated, filtered by pipeline/status/confidence). GET /api/validation/:id (detail + signed R2 scan URL). PUT /api/validation/:id (corrections + validate/reject + audit).
**Commit**: `feat(core): T008 - validation API`
**Validation**: QS-8

#### T009: React app skeleton + auth
**Files**: `packages/web/src/App.tsx`, `lib/api.ts`, `hooks/useAuth.ts`, `pages/Login.tsx`
**Action**: React Router, protected routes, API client with JWT, login page, redirect to /validation.
**Commit**: `feat(web): T009 - React app + auth`

#### T010: Scan upload page
**Files**: `packages/web/src/pages/Scan.tsx`, `components/FileUpload.tsx`
**Action**: Document type selector (dropdown from /api/admin/pipelines). Drag-and-drop upload zone. Submit calls POST /api/documents/scan. Show result preview. Navigate to validation detail.
**Commit**: `feat(web): T010 - scan upload page`

#### T011: Basic validation page
**Files**: `pages/ValidationQueue.tsx`, `pages/ValidationDetail.tsx`, `components/DocumentForm.tsx`, `components/ScanViewer.tsx`, `components/ConfidenceBadge.tsx`
**Action**: Queue table (pipeline, fields summary, confidence, date). Detail: split-screen — ScanViewer (zoomable) + DocumentForm (auto-generated from extracted_data fields). ConfidenceBadge. Validate button.
**Commit**: `feat(web): T011 - validation UI`

---

## Phase 2 — MVP: Full Pipeline for Bulletin de Soin

> Adds: Pipeline engine, bulletin_soin rules, batches, complete UI, mobile

### Core: Pipeline Engine

#### T012: Pipeline engine + rule registry
**Files**: `packages/api/src/core/pipeline/engine.ts`, `registry.ts`
**Action**: `PipelineEngine`: loads pipeline config, iterates rule_steps[], calls registered rule functions in order. `RuleRegistry`: register rule types by name ("lookup", "compute", "validate", "anomaly"). Each returns RuleResult with computed fields and/or anomalies.
**Commit**: `feat(core): T012 - pipeline engine`
**Validation**: QS-3

#### T013: Generic rule types (lookup, validate, anomaly)
**Files**: `packages/api/src/core/pipeline/rules/lookup.ts`, `validate.ts`, `anomaly.ts`
**Action**: `LookupRule`: find matching entry in a lookup_table by field value. `ValidateRule`: check field constraints (required, format, range). `AnomalyRule`: duplicate detection (configurable fields + time window). Generic — reusable across pipelines.
**Commit**: `feat(core): T013 - generic rule types`

### Bulletin de Soin Pipeline

#### T014: Bulletin de soin rules (reimbursement, PCT, anomalies)
**File**: `packages/api/src/pipelines/bulletin_soin/rules.ts`
**Action**: Register under pipeline engine: company lookup (by name/policy prefix → bs_companies), contract → conditions lookup, reimbursement calculator (rate × min(invoiced, ceiling, PCT)), PCT medication fuzzy match, annual ceiling check, ticket modérateur calc, healthcare-specific anomalies (expired policy, waiting period, unknown practitioner). All read from bs_* tables.
**Commit**: `feat(pipeline): T014 - bulletin_soin rules`
**Validation**: QS-4, QS-5, QS-6

#### T015: Queue consumer for async pipeline processing
**Action**: DOC_QUEUE consumer: on document_id → load from D1 → load pipeline → PipelineEngine.execute() → update document computed_data + anomalies.
**Commit**: `feat(core): T015 - async pipeline processing`

### Core: Batches

#### T016: Batch lifecycle state machine
**File**: `packages/api/src/core/batches/lifecycle.ts`
**Action**: `BatchService`: getOrCreateOpenBatch(pipelineId, groupKey, groupLabel), addDocument (auto-close at max_count), closeBatch, verifyBatch, exportBatch, settleBatch. State transitions enforced.
**Commit**: `feat(core): T016 - batch lifecycle`
**Validation**: QS-7

#### T017: Cron for time-based batch closure
**Action**: Cron every 5min: query open batches past max_days → auto-close. `[triggers] crons = ["*/5 * * * *"]`.
**Commit**: `feat(core): T017 - cron batch closure`

#### T018: Bulletin de soin export (bordereau PDF)
**File**: `packages/api/src/pipelines/bulletin_soin/export.ts`
**Action**: Generate PDF bordereau (company header, document table, totals) + Excel detail. Registered as export_template "bordereau_pdf" in pipeline engine.
**Commit**: `feat(pipeline): T018 - bordereau PDF`
**Validation**: QS-9

#### T019: Batch API routes
**File**: `packages/api/src/core/batches/routes.ts`
**Action**: GET /batches, GET /batches/:id, POST close/verify/export/settle. Admin-only mutations.
**Commit**: `feat(core): T019 - batch routes`

### Validation Complete

#### T020: Keyboard navigation
**Files**: `hooks/useKeyboardNav.ts`, update ValidationDetail
**Action**: Tab (skip high-confidence), Enter confirm, Ctrl+Enter validate, Escape back. Smart tab: low-confidence first.
**Commit**: `feat(web): T020 - keyboard nav`

#### T021: Batch validation mode
**Action**: Checkboxes, "Select all >95%", "Validate selected" (max 20). Confirmation dialog.
**Commit**: `feat(web): T021 - batch validation`

### Mobile

#### T022: Initialize Expo project
**Action**: Expo managed, tabs (Scan/History/Profile), NativeWind, API client, SecureStore JWT.
**Commit**: `feat(mobile): T022 - Expo init`

#### T023: Document scanner with type selection
**Files**: `app/(tabs)/scan.tsx`, `components/DocumentScanner.tsx`
**Action**: Pipeline selector (from API), camera capture, edge detection, crop, multi-page, preview, upload to /api/documents/scan with pipeline name.
**Commit**: `feat(mobile): T023 - scanner + type select`

#### T024: History + offline
**Action**: Submission history. Offline queue (AsyncStorage). Background sync.
**Commit**: `feat(mobile): T024 - history + offline`

#### T025: OTP auth
**Action**: Twilio SMS OTP. 6-digit code, 5min KV expiry. Profile tab.
**Commit**: `feat(mobile): T025 - OTP auth`

---

## Phase 3 — Production: Multi-Pipeline, Admin, Dashboard

### Dashboard

#### T026: Dashboard API
**Action**: GET /dashboard/kpis (by pipeline: documents today, pending, batches, AI metrics). GET /dashboard/reports (filterable).
**Commit**: `feat(dashboard): T026 - dashboard API`

#### T027: Dashboard UI
**Action**: KPI cards, charts (recharts: trend, pipeline breakdown, confidence). Pipeline filter. Auto-refresh 60s.
**Commit**: `feat(dashboard): T027 - dashboard UI`

#### T028: Report export
**Action**: POST /dashboard/reports/export → PDF/Excel in R2.
**Commit**: `feat(dashboard): T028 - report export`

### Admin

#### T029: Pipeline configuration UI
**Files**: `admin/Pipelines.tsx`, `packages/api/src/admin/pipelines.ts`
**Action**: View/edit pipelines: display_name, ocr_schema, rule_steps (JSON editor), batch_config, field_display. Cannot create new pipelines from UI (requires rule code), but can modify configs.
**Commit**: `feat(admin): T029 - pipeline config UI`

#### T030: Lookup tables management
**Files**: `admin/LookupTables.tsx`, `packages/api/src/admin/lookup-tables.ts`
**Action**: CRUD lookup tables + entries. CSV/Excel import with upsert (historization via valid_from/valid_to). Search/browse. Used for companies, PCT, suppliers, any reference data.
**Commit**: `feat(admin): T030 - lookup tables`

#### T031: Bulletin de soin admin (companies, contracts, PCT, practitioners)
**Files**: `admin/BulletinSoinConfig.tsx`, `packages/api/src/admin/routes.ts` (pipeline-specific routes)
**Action**: Dedicated UI for bulletin_soin pipeline: bs_companies CRUD (+ lot params), bs_contracts + bs_conditions (inline rates/ceilings), PCT import/search, practitioners CRUD. All via /api/pipelines/bulletin_soin/* routes.
**Commit**: `feat(admin): T031 - bulletin_soin admin`

#### T032: User management
**Action**: CRUD users (email, name, role, active). Roles: admin, operator, consultant.
**Commit**: `feat(admin): T032 - user management`

#### T033: Audit trail viewer
**Action**: Paginated audit log, filterable by entity/action/user/date. JSON diff view.
**Commit**: `feat(admin): T033 - audit trail UI`

### Extended Config

#### T034: Configure 5 insurance companies
**Action**: Full STAR/GAT/COMAR/CARTE/AMI via Admin UI. Contracts, conditions, realistic rates. Save as production seed.
**Commit**: `feat(pipeline): T034 - 5 company configs`

#### T035: Prepare facture pipeline config
**Action**: Insert facture pipeline in D1 (ocr_schema: "efactura_tn", rule_steps: supplier lookup + TVA calc + duplicate detection, batch_config: by supplier, CSV export). Implement facture-specific rules in `pipelines/facture/rules.ts`. Verify QS-10.
**Commit**: `feat(pipeline): T035 - facture pipeline`
**Validation**: QS-10

### Infrastructure

#### T036: Cloudflare Pages deployment
**Action**: Configure Pages for web frontend. Build + deploy pipeline.
**Commit**: `feat(infra): T036 - Pages deployment`

#### T037: Production environment
**Action**: Production D1, R2, KV, Queue. Secrets. Schema + seed on prod D1.
**Commit**: `feat(infra): T037 - production env`

#### T038: Monitoring + health check
**Action**: GET /api/health (D1+R2+KV+OCR check). Error tracking. Request logging.
**Commit**: `feat(infra): T038 - monitoring`

### Tests

#### T039: Unit tests — extraction adapter + mapper
**Action**: Retry logic, mapper normalization, generic across schemas. Fixture: bulletin_sample.json.
**Commit**: `feat(test): T039 - extraction tests`

#### T040: Unit tests — pipeline engine
**Action**: Engine executes steps in order, handles step failures gracefully, aggregates results. Mock rule steps.
**Commit**: `feat(test): T040 - pipeline engine tests`

#### T041: Unit tests — bulletin_soin rules
**Action**: Reimbursement, ceiling, PCT, anomalies. Fixture data for companies/contracts/conditions.
**Commit**: `feat(test): T041 - bulletin_soin rules tests`

#### T042: Unit tests — batch lifecycle
**Action**: Create, add, auto-close, state transitions, lock exported. Generic for any pipeline.
**Commit**: `feat(test): T042 - batch tests`

#### T043: Integration tests — API endpoints
**Action**: Login → scan (bulletin_soin) → validate → batch → export. Auth, errors. Scan with facture pipeline.
**Commit**: `feat(test): T043 - API integration tests`

#### T044: E2E test — full bulletin_soin pipeline
**Action**: Image → extraction → rules → validation → batch close → bordereau PDF. All state transitions + audit.
**Commit**: `feat(test): T044 - E2E test`

---

## Summary

| Phase | Tasks | Weeks | Focus | Gate |
|---|---|---|---|---|
| **POC** | T001-T011 | 3 | Core platform + extraction + basic UI | >85% accuracy |
| **MVP** | T012-T025 | 7 | Pipeline engine + bulletin_soin + batches + mobile | Full pipeline 1 company |
| **Prod** | T026-T044 | 7 | Dashboard + admin + facture pipeline + tests | 5 companies, 2 pipelines |

### Parallel Groups
- Phase 1: T005-T007 (extraction) ∥ T009-T011 (web UI)
- Phase 2: T012-T015 (pipeline engine) ∥ T016-T019 (batches) then T020-T021 (UI) ∥ T022-T025 (mobile)
- Phase 3: T026-T028 (dashboard) ∥ T029-T033 (admin) ∥ T034-T035 (pipeline configs)
