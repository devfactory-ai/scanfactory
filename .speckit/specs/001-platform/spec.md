# Feature Specification: ScanFactory — Plateforme de Traitement Intelligent de Documents

**Feature ID**: SPEC-001
**Author**: Yassine Techini — CTO DevFactory
**Created**: 2026-02-16
**Status**: Ready for Implementation

---

## Overview

### Problem Statement

Organizations across Tunisia process thousands of paper and digital documents daily — health insurance claim forms (bulletins de soin), invoices, contracts, identity documents, purchase orders, and more. These documents are processed manually: operators read forms, type data into spreadsheets, apply business rules from memory, and group processed documents into batches for export. This is slow (10-15 minutes per document), error-prone, and unscalable.

Key challenges: documents are often handwritten (Arabic and French), formats vary across providers, business rules differ per client/partner, and there is no traceability.

### Proposed Solution

ScanFactory is a generic, schema-driven platform for intelligent document processing. An operator (or automated system) submits a document image, the platform extracts all fields using AI (via the DevFactory OCR Pipeline), applies configurable business rules, presents the result to a human for fast validation, then groups validated documents into batches for export.

The platform is document-type agnostic. Each document type is defined by an extraction schema and a processing pipeline configuration. The first deployment targets health insurance bulletins de soin (300/day for an insurance agency), with invoices as the second pipeline.

### Success Criteria

- SC-1: Process a scanned document from scan to validated data in < 60 seconds (operator time)
- SC-2: AI extraction accuracy ≥ 85% on field-level (per document type, measured on first 500 real documents)
- SC-3: Support ≥ 3 document types without code changes (config only)
- SC-4: Reduce operator time per document by ≥ 80% vs. manual process
- SC-5: Full traceability — every action logged with operator, timestamp, and before/after values
- SC-6: Zero documents exported without human validation
- SC-7: Automated batch closure and export document generation

---

## User Stories

### US-1: Operator scans a document

**As an** operator,
**I want to** scan a paper document using a scanner or mobile phone and select its type,
**So that** the system extracts all relevant fields automatically using the correct schema.

**Acceptance Criteria**:
- AC-1.1: Accept image upload from desktop (scanner JPEG/PNG/PDF) and mobile (camera)
- AC-1.2: Operator selects document type from available pipelines (or system auto-detects)
- AC-1.3: Send image to OCR service with the correct schema for that document type
- AC-1.4: Display extracted data alongside the original scan image (split-screen)
- AC-1.5: Confidence score displayed per field, color-coded (green ≥90%, orange 70-90%, red <70%)
- AC-1.6: Document automatically assigned to the correct batch based on pipeline rules

### US-2: Operator validates extracted data

**As an** operator reviewing an AI-extracted document,
**I want to** quickly verify and correct extracted fields using keyboard shortcuts,
**So that** I can process hundreds of documents per day without fatigue.

**Acceptance Criteria**:
- AC-2.1: Split-screen view: scan image (left, zoomable) + editable fields (right)
- AC-2.2: Tab between fields, auto-focus on low-confidence fields first
- AC-2.3: One-click correction for common errors (dropdown suggestions, auto-complete)
- AC-2.4: Batch validation mode: approve multiple high-confidence documents (>95%) in one click
- AC-2.5: Validation queue shows pending documents sorted by priority (oldest first, low-confidence first)
- AC-2.6: Every correction logged in audit trail (operator, timestamp, old value, new value)

### US-3: System applies pipeline-specific business rules

**As a** system processing a validated document,
**I want to** automatically apply the business rules defined for this document type's pipeline,
**So that** computed fields (totals, reimbursements, taxes, etc.) are calculated without manual work.

**Acceptance Criteria**:
- AC-3.1: Each document type has its own pipeline with configurable rules
- AC-3.2: Rules are evaluated in order: lookup → compute → validate → detect anomalies
- AC-3.3: Computed fields stored alongside extracted fields
- AC-3.4: Anomalies detected but non-blocking — flagged for operator review
- AC-3.5: Rule configurations editable via Admin UI

### US-4: System manages batches for export

**As a** system grouping documents for export,
**I want to** automatically create, fill, and close batches per configurable criteria,
**So that** processed documents can be submitted to recipients efficiently.

**Acceptance Criteria**:
- AC-4.1: Batches created automatically per pipeline grouping rules (by client, type, recipient)
- AC-4.2: Batches close based on dual conditions: max count OR max time (configurable)
- AC-4.3: Batch lifecycle: Open → Closed → Verified → Exported → Settled
- AC-4.4: Generate export document (PDF/Excel/CSV) per pipeline template
- AC-4.5: Track settlement — mark batch as Settled when confirmation received
- AC-4.6: Prevent modifications to documents in Exported or Settled batches

### US-5: Admin configures document types and pipelines

**As an** administrator,
**I want to** configure new document types, extraction schemas, and processing pipelines,
**So that** the platform handles new use cases without code changes.

**Acceptance Criteria**:
- AC-5.1: CRUD document types (name, description, OCR schema reference, pipeline config)
- AC-5.2: Configure pipeline rules per document type (lookup tables, computation formulas, validation rules)
- AC-5.3: Configure batch parameters per pipeline (grouping, max count, max period, export template)
- AC-5.4: Import/manage reference data (lookup tables used by rules)
- AC-5.5: Manage users and roles
- AC-5.6: All configuration changes logged in audit trail

### US-6: Admin monitors operations via dashboard

**As a** manager,
**I want to** see real-time operational metrics and generate reports,
**So that** I can monitor throughput, quality, and performance.

**Acceptance Criteria**:
- AC-6.1: Real-time KPIs: documents processed today, pending, batches status
- AC-6.2: Reporting by document type, time period, operator
- AC-6.3: AI performance metrics: average confidence, auto-validation rate, correction frequency
- AC-6.4: Export reports as PDF and Excel

### US-7: Mobile user captures documents on the go

**As a** field agent,
**I want to** capture documents using my smartphone,
**So that** they enter the processing pipeline immediately.

**Acceptance Criteria**:
- AC-7.1: Mobile app with camera capture optimized for document scanning
- AC-7.2: Select document type before or after capture
- AC-7.3: Multi-page scanning with association to the same dossier
- AC-7.4: Offline mode: scan and queue, upload when connectivity returns
- AC-7.5: Track submission status and history

---

## First Deployment: Insurance Bulletin de Soin Pipeline

| Dimension | Configuration |
|---|---|
| Document Type | bulletin_soin |
| OCR Schema | `bulletin_soin.json` (8 Replace + 2 Table + 16 Direct fields) |
| Client | Insurance agency, Tunisia |
| Volume | 300 documents/day |
| Pipeline Rules | Company lookup → contract → reimbursement calc → PCT pricing → anomaly detection |
| Batch Grouping | Per insurance company |
| Export Format | PDF bordereau + Excel detail |
| Specific Features | CNAM nomenclature, PCT reference pricing, CIN validation, TND currency |

## Second Pipeline (Planned): Invoice Processing

| Dimension | Configuration |
|---|---|
| Document Type | facture |
| OCR Schema | `efactura_tn.json` (existing DevFactory schema) |
| Pipeline Rules | Supplier lookup → line item validation → TVA calculation → duplicate detection |
| Batch Grouping | Per supplier or per accounting period |
| Export Format | CSV for accounting software import |

---

## Actors and Roles

| Role | Description | Key Actions |
|---|---|---|
| **Admin** | Platform administrator | Configure pipelines, document types, rules, users. Dashboard. |
| **Operator** | Document processing staff | Scan, validate, correct, manage batches. |
| **Consultant** | Read-only access | View documents, batches, reports. |
| **Mobile Agent** | Field agent with mobile app | Capture documents on-site. |

---

## Non-Functional Requirements

### Performance
- NFR-1: Scan-to-validation display < 10 seconds
- NFR-2: Validation UI response time < 200ms for field corrections
- NFR-3: Dashboard loads in < 2 seconds
- NFR-4: Export document generation < 5 seconds per batch of 100

### Security
- NFR-5: Authentication via email + password (admin/operator), OTP SMS (mobile)
- NFR-6: Role-based access control
- NFR-7: Complete audit trail on all data modifications
- NFR-8: Document images stored encrypted in R2

### Availability
- NFR-9: 99.5% uptime during business hours
- NFR-10: Graceful degradation if OCR service is down (queue for later)

---

## Out of Scope (v1)

- Direct integration with external IT systems (export is manual via files)
- End-user facing portal
- Automated ML model training or fine-tuning
- Multi-tenant (single organization per deployment for v1)
- Streaming/real-time processing (batch-oriented)
- Automated document type detection (operator selects type manually)
