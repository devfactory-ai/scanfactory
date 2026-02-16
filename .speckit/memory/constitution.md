# Constitution — ScanFactory

## I. Cloudflare-Native Architecture

All components MUST run on Cloudflare. Workers for API/logic, D1 for relational data, R2 for document storage, KV for cache and sessions, Queues for async processing. No external databases, no VMs, no containers. The ONLY external dependency is the DevFactory OCR Pipeline API for document extraction.

## II. OCR as External Service

Document extraction is handled by the DevFactory OCR Pipeline (separate service). ScanFactory consumes it via API using configurable schemas (bulletin_soin, facture, etc.). An Adapter pattern MUST abstract the OCR service call, enabling future provider changes without application code modifications. ScanFactory NEVER processes images directly — it sends them to the OCR API and receives structured JSON.

## III. Schema-Driven, Document-Type Agnostic

The platform is generic. Each document type (bulletin de soin, facture, contrat, etc.) is defined by a schema + a processing pipeline configuration. Adding a new document type = new schema + pipeline config, zero code changes. The core engine (scan → extract → validate → export) is shared across all document types.

## IV. Human-in-the-Loop by Default

No document is exported or marked as final without human validation. Even high-confidence extractions (>95%) MUST pass through the validation queue. Batch validation (one-click approve for high-confidence groups) is allowed, but individual review MUST always be possible.

## V. Pipeline-Per-Document-Type

Each document type defines its own processing pipeline: which business rules apply, how documents are grouped (lots/batches), what export format is generated, and which validation rules run. Pipelines are configurable via Admin UI, not hardcoded.

## VI. Operator Efficiency First

The validation interface is the most-used screen. Every UI decision MUST optimize operator throughput: keyboard navigation, one-click corrections, split-screen scan/data view, confidence-based color coding, smart field tabbing. Target: < 60 seconds per document in validation.

## VII. Batch-Based Export Workflow

Validated documents are grouped into batches (lots) per configurable criteria (by client, by document type, by recipient). Batches close automatically based on configurable dual conditions: max document count OR max time period. Each batch follows a strict lifecycle: Open → Closed → Verified → Exported → Settled.

## VIII. Modular Architecture

The application is structured into clearly separated modules: Core (scan/extract/validate), Pipelines (document-type-specific logic), Admin (configuration), Dashboard (reporting), Mobile (capture), Infrastructure (auth/deployment). Modules communicate via internal function calls, not HTTP.

## IX. Test-Driven Development

Every module MUST have unit tests. The extraction adapter, pipeline engines, and batch lifecycle MUST have tests that run WITHOUT external services — using fixtures. Integration tests require `wrangler dev` running locally.

## X. Library-First, Minimal Dependencies

Frontend uses React + Tailwind (via Cloudflare Pages). Backend Workers use Hono as sole npm dependency — plus Web APIs and Cloudflare bindings. Mobile uses React Native with Expo. Prefer built-in Cloudflare features over external services.

## XI. Commit Strategy

Each completed task requires its own git commit. Commit messages follow: `feat(module): T00X - brief description`. Modules: `core`, `pipeline`, `admin`, `dashboard`, `mobile`, `infra`.

## Governance

- Constitution supersedes all other documents
- Business rules and pipeline configs are NEVER hardcoded
- When in doubt, optimize for operator speed
- Adding a new document type must NOT require code changes
- Deviations require explicit justification
