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

Status: in progress (schema design only; no migration applied).

Exact next action: restore the validated GED schema draft after the Phase 1 checkpoint, add the additive/backfill migration, then implement tenant/sensitivity-safe GED services, versioning, linking, validation, integrity, checklist automation, UI and focused tests.

## Phase 3 — Suppliers and China Offers

Status: not started.

## Phase 4 — Contracts, Collections, Finance and Treasury

Status: not started.

## Phase 5 — Shipping, Customs, Transit and Delivery

Status: not started.

## Phase 6 — Integration and hardening

Status: not started.
