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

Status: implemented; minimum verification completed. Exhaustive integration/Docker runtime verification is deferred until tomorrow.

Completed requirements:

- Canonical `Partner` supplier extension with independent verification lifecycle (`TO_VERIFY -> VERIFIED -> ACTIVE`, suspension/reactivation), supplier type, multiple normalized contacts, WhatsApp/WeChat, currency, Incoterms, lead/payment/delivery terms and four-dimensional score.
- Restricted AES-backed supplier bank-detail records with metadata/reveal/write permissions and audits that never contain account values; incidents, resolution, dossier links and tenant-safe detail tabs/projections.
- Supplier overview KPIs from canonical offers, purchases, vehicles, validated payments and incidents; supplier data remains referenced rather than copied into downstream modules.
- `ChinaOffer` V2 supplier reference/price, Incoterm, location, lead time, validity, conditions, VIN and controlled workflow. Legacy CIF/DDP columns remain for read compatibility and are explicitly marked as historical estimates; customer pricing authority is Tarification/Quotation.
- Append-only `ChinaOfferRevision` snapshots and status history. Existing legacy offers without a defensible actor/revision remain explicit reconciliation items; their first edited version captures the baseline before the change.
- Idempotent assignment to one tenant-owned Dossier, source-traceable purchase/vehicle creation, supplier-dossier link, serializable stock claim and unique-conflict recovery.
- Additive permissions, backend endpoints, French supplier/offer UI fields, KPI/detail views, workflow controls and price/status history.

Migration:

- `backend/prisma/migrations/20260829030000_erp_v2_phase3_suppliers_offers/migration.sql`
- Additive tables/nullable columns/check constraints/indexes and known-value backfills only. Unknown legacy supplier/offer states, offers without supplier price and actorless legacy revisions are reported rather than guessed.
- Read-only preflight and reconciliation: `backend/scripts/erp-v2-phase3-suppliers-offers-{preflight,reconciliation}-readonly.sql`.

Verification evidence:

- Prisma format, validation and client generation: passed.
- Focused suppliers/offers tests: 2 suites, 8 tests passed.
- Backend build: passed.
- Frontend lint: zero errors and 13 pre-existing fixture warnings.
- Frontend build initially found a real optional CIF/DDP API type regression; the compatibility type was corrected and the production build then passed.
- Fresh disposable PostgreSQL 17 migration: all 17 migrations applied successfully.
- Post-migration reconciliation on the fresh database: all seven unresolved/cross-tenant/mismatch metrics were zero.
- `git diff --check`: passed; labeled tmpfs disposable PostgreSQL container removed after verification.

Affected areas:

- Prisma schema and Phase 3 migration/scripts.
- Backend partners and offers DTOs/controllers/services/focused tests.
- Shared permission contracts.
- Frontend commerce API, suppliers workspace, China offers list/create and offer detail/history.

Known deferred checks:

- Representative production-shaped supplier/offer reconciliation with real legacy status vocabulary and actor assignment.
- Authenticated multipart offer creation, bank reveal denial/audit, cross-tenant assignment and true concurrent dossier assignment integration tests.
- Full suites and production Docker runtime inspection.

Exact next action: create the verified Phase 3 Git checkpoint, then implement Phase 4 financial ledgers as additive canonical projections over existing contracts, invoices, payments, supplier payments, purchases and costs.

## Phase 4 — Contracts, Collections, Finance and Treasury

Status: implemented; minimum verification completed. Historical financial backfill reconciliation and exhaustive integration are deferred until tomorrow.

Completed requirements:

- New customer `Contract` authority linked to one Client and Dossier with generated number, total/currency, required deposit, append-only schedule, signed GED document and optional invoice. Schedule totals are decimal-validated and signing is controlled/audited.
- Customer collections reuse canonical `Payment`; contract detail derives total paid, balance and deposit/partial/paid state only from confirmed payments. Idempotency keys prevent duplicate collection recording.
- Additive central `FinanceTransaction` ledger with unique source module/record and idempotency keys, original amount/currency, permanent exchange-rate snapshot, DZD value, dossier/client/supplier/account links and supporting GED document.
- Confirmed customer and supplier payments and posted direct/operating costs create their source-linked ledger movement automatically. Missing historical FX evidence blocks non-DZD validation instead of inventing a rate.
- Direct dossier cost and operating expense classification; dossier margin continues to derive from canonical validated records.
- Treasury accounts for cash/bank/currency/other and balances derived from validated credit/debit movements plus opening balance.
- Validated ledger entries have no edit/delete route. Authorized correction creates an opposite linked transaction and audits the reversal; payment/supplier-payment/cost reversals also invalidate their projected ledger entry.
- New contracts, treasury and reversal permissions; Contracts & Collections and Finance/Treasury frontend projections with French labels. Legacy invoice/payment views remain compatible and invoices remain optional.

Migration:

- `backend/prisma/migrations/20260829040000_erp_v2_phase4_contracts_finance/migration.sql`
- Additive tables, nullable links, cost-scope projection, indexes, checks and permissions only. Existing financial records are not altered; ledger backfill is deliberately a reconciliation gate because rate/validator/account evidence cannot be guessed.
- Read-only reports: `backend/scripts/erp-v2-phase4-finance-{preflight,reconciliation}-readonly.sql`.

Verification evidence:

- Prisma format, validation and client generation: passed.
- Focused finance suites: 2 suites, 15 tests passed (contract schedule/balance, exchange snapshots, idempotency, reversals and existing comprehensive finance behavior).
- A real focused-test failure exposed missing currency in a legacy fixture; the fixture was corrected to represent the required persisted field and the suites passed.
- Backend build: passed.
- Frontend production build: passed with Contracts & Collections, ledger and treasury projections.
- Fresh disposable PostgreSQL 17 migration: all 18 migrations applied; migration status up to date.
- Fresh post-migration reconciliation: all six missing-ledger/schedule/snapshot/cross-tenant metrics were zero.
- Labeled tmpfs disposable PostgreSQL container removed after verification.

Affected areas:

- Prisma schema, Phase 4 migration and read-only reports.
- Finance module: contract/ledger controllers, services, DTOs, payment/supplier-payment/cost projections and focused tests.
- Shared permissions.
- Frontend finance API, Contracts & Collections page and Finance/Treasury page.

Known deferred checks/gates:

- Read-only preflight against a production-shaped copy and controlled historical ledger backfill for confirmed payments, supplier payments and posted costs.
- Treasury-account assignment and payment-evidence linking workflows require operator reference/account decisions.
- Authenticated concurrent collection confirmation, cross-tenant contract/GED access, Finance/Direction reversal authorization and complete Docker/full-suite verification.

Exact next action: create the verified Phase 4 Git checkpoint, then implement Phase 5 by extending shared maritime shipments and enforcing one customs/transit file per vehicle and Dossier with idempotent arrival automation.

## Phase 5 — Shipping, Customs, Transit and Delivery

Status: implemented; minimum verification completed. Production-shaped reconciliation and exhaustive authenticated automation tests are deferred until tomorrow.

Completed requirements:

- Maritime `Shipment` remains the shared container/B/L/vessel authority with multiple vehicles and a centralized sequential workflow (`pending -> booked -> loading -> inTransit -> arrived`; cancellation only before transit).
- `CustomsFile` remains separate and now carries a V2 per-vehicle/Dossier identity, responsible user, copied container/B/L/arrival-port context, DUM/reference, release/port-exit dates and reconciliation marker.
- Central customs/transit workflow: `TO_PREPARE -> AWAITING_ARRIVAL -> ARRIVED_AT_PORT -> FILE_TRANSMITTED -> CLEARANCE_IN_PROGRESS -> INSPECTION -> DUTIES_TAXES -> RELEASE -> PORT_EXIT -> CLOSED` with actor/timestamp history and invalid-transition rejection.
- Additive partial uniqueness applies only to reconciled/V2 customs rows, so ambiguous historical duplicates cannot fail deployment. Service-level pre-check and P2002 recovery return the canonical file under concurrent creation.
- `Create Customs Files` from a shipment copies existing vehicle/shipment/dossier data, creates one file for each unambiguous vehicle, returns ambiguous dossier candidates without merging, and is idempotent.
- Arrival transition invokes the same automation, assigns the Dossier operations/sales user, and creates deduplicated tasks/notifications. `PORT_EXIT` creates an idempotent delivery-handoff task/notification without skipping the established Dossier workflow.
- Tenant-owned vehicle/Dossier/shipment/responsible-user validation. Legacy incomplete customs records remain visible and retain their legacy workflow actions while being flagged for V2 reconciliation.
- Granular shipment transition, customs transition and customs automation permissions; updated French logistics UI includes staged shipment controls, create-from-shipment, VIN/container/port/responsible columns and V2 workflow actions.

Migration:

- `backend/prisma/migrations/20260829050000_erp_v2_phase5_shipping_customs/migration.sql`
- Additive nullable workflow/snapshot/responsibility columns, safe known-value backfill, reconciliation markers, partial unique/indexes and permissions. No existing shipment/customs row is deleted or forcibly merged.
- Read-only reports: `backend/scripts/erp-v2-phase5-logistics-{preflight,reconciliation}-readonly.sql`.

Verification evidence:

- Prisma format, validation and client generation: passed.
- Focused shipment/customs suites: 2 suites, 7 tests passed, including multi-vehicle create-from-shipment idempotency, transitions and tenant isolation.
- A focused legacy test initially attempted the now-invalid `booked -> inTransit` jump; it was corrected to exercise `loading -> inTransit`, and the suite passed.
- Backend build: passed after final legacy-compatibility changes.
- Frontend production build: passed with `/expeditions` generated.
- Fresh disposable PostgreSQL 17 migration: all 19 migrations applied; migration status up to date.
- Fresh post-migration reconciliation: all five ambiguity/responsibility/snapshot/duplicate/arrival metrics were zero.
- Labeled tmpfs disposable database container removed after verification.

Affected areas:

- Prisma schema, Phase 5 migration and reports.
- Shipment/customs DTOs, controllers, services and focused tests.
- Shared permissions.
- Frontend logistics API and Expeditions/Customs workspace.

Known deferred checks/gates:

- Production-shaped duplicate/missing-link reconciliation and responsible-user assignment for legacy customs files.
- Real concurrent arrival webhook/transition replay with multiple vehicles and ambiguous Dossier candidates.
- Authenticated task/notification/delivery-handoff permission tests, finance projection for real customs/shipping costs and complete Docker/full-suite verification.

Exact next action: create the verified Phase 5 Git checkpoint, then perform Phase 6 cross-module hardening, consolidated reports/runbook/smoke coverage and final buildable-state verification without deployment.

## Phase 6 — Integration and hardening

Status: not started.
