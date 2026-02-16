# CLAUDE.md — ScanFactory

## Project Overview

Generic, schema-driven platform for intelligent document processing. Scan → AI extraction → pipeline-specific business rules → human validation → batch export. Built by DevFactory.

**First pipeline**: Bulletin de soin (health insurance claims, 300/day, Tunisia).
**Second pipeline**: Factures (invoices).
**Architecture**: Document-type agnostic. Adding a new type = schema + pipeline config, zero code.

## Architecture

```
Mobile/Scanner → Image + Pipeline Selection
                        │
                        ▼
               Cloudflare Worker (Hono)
                        │
                OCR Adapter (Adapter pattern)
                        │
              DevFactory OCR Pipeline API
        (schema from pipeline config: bulletin_soin, facture, ...)
                        │
                        ▼
               Pipeline Engine
        (executes rule_steps[] in order:
         lookup → compute → validate → anomaly)
                        │
                        ▼
              Validation Queue
        (operator review, corrections)
                        │
                        ▼
              Batch Management
        (auto-close, export generation)
                        │
                        ▼
                Export to Recipients
```

## Key Files

- `.speckit/memory/constitution.md` — Non-negotiable principles. READ FIRST.
- `.speckit/specs/001-platform/spec.md` — Product spec (7 user stories)
- `.speckit/specs/001-platform/plan.md` — Technical plan (D1 schema, pipeline engine)
- `.speckit/specs/001-platform/tasks.md` — 44 tasks (T001-T044), 3 phases
- `.speckit/specs/001-platform/data-model.md` — Generic + bulletin_soin data models
- `.speckit/specs/001-platform/contracts/api-spec.json` — Full API contract
- `.speckit/specs/001-platform/quickstart.md` — 10 validation scenarios
- `.speckit/specs/001-platform/research.md` — Technology decisions
- `schemas/bulletin_soin.json` — OCR schema for DevFactory pipeline

## Tech Stack

| Component | Technology | Constraint |
|---|---|---|
| Backend | Cloudflare Workers + Hono | Hono = only npm dep |
| Database | Cloudflare D1 | All rules + configs in D1 |
| Storage | Cloudflare R2 | Scans + exports |
| Cache | Cloudflare KV | Sessions, config |
| Async | Cloudflare Queues | Document processing |
| Frontend | React 18 + Tailwind + Pages | SPA |
| Mobile | React Native + Expo | Camera, offline |
| OCR | DevFactory OCR Pipeline | Adapter pattern |

## Key Concepts

### Pipeline = Document Type
Each document type has a pipeline config in D1:
- `ocr_schema`: which DevFactory schema to use
- `rule_steps[]`: ordered business rule functions
- `batch_config`: how to group and export
- `field_display`: how to present in validation UI

### Generic Core vs Pipeline-Specific Code
- `src/core/` — shared: extraction, pipeline engine, validation, batches
- `src/pipelines/{name}/` — type-specific: rule implementations, export templates
- `src/admin/` — configuration UI
- Adding a pipeline = new config in D1 + rules.ts in pipelines/ folder

## Critical Rules

1. **Constitution is law** — Read `.speckit/memory/constitution.md`
2. **Schema-driven** — NO document-type logic in core code
3. **Human-in-the-Loop** — NO document exported without validation
4. **No hardcoded rules** — ALL in D1, editable via Admin
5. **Operator speed** — Validation UI < 60s per document
6. **Batch lifecycle** — Open → Closed → Verified → Exported → Settled
7. **Audit everything** — Every change in audit_log

## Dev Commands

```bash
cd packages/api && wrangler dev                    # API dev
cd packages/api && wrangler d1 execute DB --local --file=src/db/schema.sql
cd packages/web && npm run dev                     # Frontend dev
cd packages/mobile && npx expo start              # Mobile dev
npm test                                           # All tests
```

## Task Execution

tasks.md: T001-T011 (POC) → T012-T025 (MVP) → T026-T044 (Prod).
Phase 1 gate: >85% extraction accuracy before Phase 2.
