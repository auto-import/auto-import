# ERP V2 implementation progress

Last updated: 2026-08-29

Safety boundary: local repository and explicitly disposable local databases only. No VPS, production/staging database, deployment, push, merge, reset, development seed, credential, dump, or environment-file mutation is authorized.

## Phase 1 — CRM Leads and Clients

Status: implemented; minimum and release-gate verification completed. Exhaustive Docker runtime and full E2E rerun intentionally deferred by the operator's reprioritization.

Completed requirements:

- Tenant-configurable Entry Channel, Marketing Source, country and nationality reference data with legacy source preservation and reconciliation markers.
- Independent qualification and CRM workflow, centralized transition validation/history, follow-up actions, assignee validation, filters and idempotent task projection.
- Canonical Algerian/international phone normalization through `ContactPoint`, deterministic match/ambiguity behavior, and service/API retry/error mapping for concurrency conflicts.
- Atomic, serializable and idempotent Lead-to-Client conversion with one canonical `Client` and one append-only `ProspectConversion` lineage row.
- Optional protected client identity fields, masked general responses, permission-gated reveal with audit, multi-dossier client ownership, permission-aware client workspace tabs, and tenant-safe queries.
- Archive-first deletion with legacy DELETE-route compatibility; no business record is physically deleted.
- Shared contracts, French UI labels, forms, filters and API integration.
- Additive migration, read-only preflight/reconciliation, migration safety checker, authenticated release-gate E2E and credential-safe smoke script.

Migration:

- `backend/prisma/migrations/20260829010000_erp_v2_phase1_crm_clients/migration.sql`

Verification evidence:

- Prisma format/validate: passed.
- Backend focused and complete tests: 45 suites, 236 tests passed.
- Phase 1 authenticated release-gate E2E: 2/2 passed after fixing a real Prisma `P2010`/PostgreSQL `40001` conversion race leak.
- Backend build: passed.
- Frontend focused/complete tests: 12 files, 28 tests passed.
- Frontend lint: zero errors, 13 pre-existing fixture warnings; frontend build passed.
- Migration safety checker: passed; no destructive row/table/column statements and no premature phone uniqueness projection.
- Fresh and representative pre-V2 disposable migration harnesses: passed; legacy sources preserved and ambiguous phones retained for reconciliation.
- Production Docker image builds for migrate/backend/frontend: passed; runtime artifact inspections passed.
- `git diff --check`: passed at the Phase 1 boundary.

Known non-regressions/deferred checks:

- Existing backend lint debt remains: 546 errors and 200 formatting findings, as documented in Phase 0.
- The PostgreSQL adapter emits a deprecation warning during truly concurrent API calls; caller behavior and persisted invariants passed, but the warning should be rechecked during tomorrow's exhaustive run.
- Re-run complete authenticated E2E, Docker runtime/health and all suites tomorrow as the final release gate.

Affected areas:

- `backend/prisma/schema.prisma`, Phase 1 migration and read-only scripts.
- Backend CRM, prospects, clients, call-center, authorization/audit and tests.
- `contracts/index.{js,d.ts}`.
- Frontend CRM workspaces, API contracts/client and focused tests.
- Staging Docker Compose, production Dockerfile and Linux deployment/runbook documentation.

Exact next action: create the verified Phase 1 Git checkpoint, then implement the additive Phase 2 GED schema and migration while retaining `FileAsset` as the only physical blob authority.

## Phase 2 — Central GED/Documents

Status: implemented; minimum verification completed. Exhaustive E2E/Docker runtime verification is deferred until tomorrow.

Completed requirements:

- `FileAsset` retained as the sole physical-byte authority with explicit encryption-provider, malware-scan, integrity and quarantine state.
- Central `GedDocument`, append-only `GedDocumentVersion`, configurable category/type, validation history and explicit FK-backed entity links for CRM, client, dossier, vehicle, supplier, offer, purchase, shipment, customs and payment.
- Central validation state machine (`TO_VALIDATE -> VALIDATED|REJECTED`); `EXPIRED` is derived from dates and a new version returns validation to `TO_VALIDATE`.
- Tenant-checked create/link/read paths, soft unlink/archive, no historical-version or production-file deletion, restricted metadata masking, separate preview/download/upload/validation permissions and allowlisted sensitive access audits.
- Authenticated PDF/image preview and download with magic-byte validation, SHA-256 verification, quarantine on mismatch, `nosniff`, sandbox CSP and private/no-store headers.
- Configurable dossier checklist rules, completion/blocking projection and idempotent task/notification generation.
- Legacy document uploads dual-write logical GED/version/link metadata while reusing the same physical asset and preserving legacy reads/responses; existing rows are bridged additively.
- Central GED frontend workspace with category/status/search filters, restricted-state display, preview/download and controlled upload; the historical view remains reachable during the release switch.
- Read-only database/storage preflight and post-migration reconciliation reports plus operational encryption/scanning requirements.

Migration:

- `backend/prisma/migrations/20260829020000_erp_v2_phase2_central_ged/migration.sql`
- Additive only: tables, nullable bridge, state columns, permissions, indexes and deterministic backfill. No legacy table/row/file is removed.
- Legacy assets with invalid/missing SHA-256 remain bridged but intentionally have no current GED version and are surfaced for reconciliation.

Verification evidence:

- Prisma format, validation and client generation: passed.
- Focused documents/GED tests: 2 suites, 11 tests passed.
- Backend build: passed.
- Frontend lint: zero errors and 13 pre-existing fixture warnings; production build passed with `/documents` generated.
- Fresh disposable PostgreSQL 17 migration: all 16 migrations applied successfully.
- Representative pre-Phase-2 fixture: 2 legacy rows, 2 bridges, 2 logical documents, 1 valid-checksum version, 4 explicit links and 1 intentionally unresolved current version.
- A real migration `GROUP BY` failure was found and fixed with deterministic `SELECT DISTINCT`; the finalized migration was then reapplied successfully to a second clean database.
- `git diff --check`: passed.
- Labeled tmpfs disposable PostgreSQL container removed after verification.

Affected areas:

- Prisma schema and Phase 2 migration.
- Backend documents controller/module, legacy compatibility service, new GED controller/service/DTO/tests and storage reconciliation scripts.
- Shared permission contracts.
- Frontend central GED workspace, documents API and legacy-view compatibility switch.
- Production Docker runtime script inclusion and Phase 2 operations documentation.

Known deferred checks:

- Full authenticated GED integration/E2E including real multipart bytes, cross-tenant permission matrix and checklist scheduler replay.
- Production Docker runtime inspection with the new scripts and private volume.
- Malware scanner and encrypted-at-rest provider are documented deployment prerequisites and are not locally provisioned.

Exact next action: create the verified Phase 2 Git checkpoint, then extend canonical `Partner` suppliers and `ChinaOffer` with contacts, restricted bank details, incidents/scoring and immutable offer revisions/actions.

## Phase 3 — Suppliers and China Offers

Status: not started.

## Phase 4 — Contracts, Collections, Finance and Treasury

Status: not started.

## Phase 5 — Shipping, Customs, Transit and Delivery

Status: not started.

## Phase 6 — Integration and hardening

Status: not started.
