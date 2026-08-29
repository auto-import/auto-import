# ERP V2 Phase 0 audit and architecture

Date: 2026-08-28
Audited commit: `4d463da` (`main`)
Scope boundary: Phase 0 only. No database, VPS, deployment, environment, seed, push, or merge operation was performed.

## Executive summary

The repository is a functioning tenant-scoped ERP, not an empty starting point. It already has CRM/call-center records, clients with encrypted identity fields, multi-vehicle dossiers, suppliers represented by `Partner`, China offers, purchases, payments, costs, shipments, customs files, private file storage, SHA-256 integrity checks, RBAC, tasks, notifications, audit logs, and production backup/restore assets.

The requested V2 is nevertheless a multi-release redesign. The largest gaps are:

- CRM stores entry channel and marketing source in one `Prospect.source` field and uses a different workflow.
- `ContactPoint` is a useful normalization authority, but legacy raw phone fields can still be ambiguous and conversion is not concurrency-idempotent.
- the Documents module is dossier/client file linking, not a central versioned GED; `BusinessDocument.entityType/entityId` has no entity foreign keys.
- suppliers lack contacts, bank-detail protection, incidents, scoring, and V2 lifecycle data.
- China offers store editable CIF/DDP values and have no append-only price/version history.
- invoices/payment plans/payments/costs are useful finance components, but there is no canonical finance journal or treasury-account ledger.
- shipment and customs histories exist, but transitions are not validated; customs files are optional on both vehicle and dossier and have no duplicate-prevention invariant.

Implementing any one of Phases 1–5 halfway would create conflicting sources of truth. The safe continuation is an expand/backfill/verify/switch/contract release for each phase, with the contract step deferred to a separately approved release.

## Repository baseline

- Backend: NestJS 11, Prisma 7.9, PostgreSQL, global JWT and permission guards.
- Frontend: Next.js 16.3, React 19, tenant-authenticated API clients and French-first UI.
- Schema: 74 models and 14 Prisma migrations.
- Storage: tenant-scoped private filesystem volume, magic-byte MIME checks for PDF/JPEG/PNG/WebP, SHA-256 checksums, authenticated streaming downloads.
- Existing migration policy: recent migrations contain relation-derived backfills and fail-closed checks, but older migrations include destructive column drops and must never be replayed manually outside normal Prisma history.
- Production controls: explicit HTTPS/CORS validation, no automatic production seed, one-shot migration container, encrypted backup plus private-document snapshot, disposable restore drill.
- Worktree was clean at audit start. Local `.env` files exist and are ignored; their contents were not inspected or changed.
- Baseline backend test result: 43 suites, 223 tests passed. This validates current behavior, not all V2 requirements.
- Backend production build and Prisma schema validation passed.
- Frontend validation passed: 12 test files/28 tests, UI text check, ESLint with zero errors (13 legacy-fixture warnings), TypeScript, and production build with 28 routes.
- Existing quality debt is preserved and reported: backend ESLint has 565 existing findings (546 errors, 19 warnings), and 200 existing backend/test files do not match the current Prettier configuration. No existing source file was reformatted or hidden.
- Backend E2E was not run because it initializes the real Prisma module and the ignored local database target was not inspected or proven disposable. This avoids an unauthorized connection to a possible production/VPS database.

## Requirement matrix

Status means V2 status, not whether some related V1 screen exists.

| Requirement                          | Existing implementation                                                                             | Status      | Schema impact                                                                 | Backend impact                                                              | Frontend impact                            | Permissions impact                                | Migration/data risk                                               | Proposed implementation                                                                                                                          | Acceptance criteria                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Tenant isolation                     | Most business models carry `organizationId`; services generally scope queries                       | Partial     | Add composite tenant-safe constraints where relations can cross tenants       | Central tenant relation assertions                                          | No material redesign                       | Reuse RBAC                                        | Medium: nullable and globally unique legacy keys                  | Verify every relation and add composite constraints after conflict reports                                                                       | Cross-tenant unit/integration suite denies all reads and writes                        |
| Lead identity fields                 | `Prospect` has names, phone, email, wilaya, notes                                                   | Partial     | Add geography references/fields                                               | Validate reference ownership                                                | Extend form/detail                         | Existing lead read/write                          | Low                                                               | Extend `Prospect`; do not create a second lead model                                                                                             | All requested fields persist and filter correctly                                      |
| Entry channel vs marketing source    | One free-text `Prospect.source`; UI mixes call/WhatsApp/manual/referral                             | Conflicting | Add tenant-configurable channel/source references and preserve `legacySource` | Resolve reference values and expose configuration endpoints                 | Two independent selectors/filters          | Reference-data manage permission                  | High: legacy values are semantically mixed                        | Expand nullable FKs, inventory values, propose mapping, require review for ambiguous values, then switch                                         | No legacy source lost; ambiguous rows reported, never guessed                          |
| Lead requirement/vehicle searched    | `VehicleRequest` can link to prospect/client                                                        | Partial     | Prefer relation; optional summary only if needed                              | Create/reuse vehicle request in lead transaction                            | Embedded requirement section               | Vehicle-request permissions plus CRM view         | Low                                                               | Treat `VehicleRequest` as canonical requirement                                                                                                  | Lead shows linked requirement without duplicated editable copy                         |
| Qualification separate from status   | `LeadQualification` is already separate                                                             | Complete    | None                                                                          | Preserve                                                                    | Preserve                                   | None                                              | Low                                                               | Keep HOT/WARM/COLD/UNCLASSIFIED                                                                                                                  | Status changes never modify qualification                                              |
| V2 CRM workflow                      | Current graph is new/contacted/interested/qualified/offerSent/negotiating/won/lost/converted        | Conflicting | Add V2 status and orthogonal lost outcome during expansion                    | One workflow service; domain-event transitions                              | Replace pipeline only after backfill       | Transition permission/audit                       | High: V2 omits existing lost/reopen semantics                     | Preserve legacy status, add V2 state, model LOST as outcome, reconcile before switch                                                             | Exact allowed transitions; every change records actor/from/to/time                     |
| Lead filters                         | Status, assignee, source, qualification, search exist                                               | Partial     | Add indexes for new refs/follow-up/updated period                             | Add channel/source/overdue/date filters                                     | Add filter controls and real pagination    | Read                                              | Low                                                               | Extend current endpoint                                                                                                                          | Filters are tenant-scoped, indexed, paginated and composable                           |
| Phone normalization                  | `ContactResolutionService`; unique tenant/kind/value `ContactPoint`                                 | Partial     | Add country configuration and reconciliation state                            | Extract pure normalization policy; consistent validation                    | Display original and match outcome         | CRM contact permission                            | High: raw legacy fields may disagree                              | Keep `ContactPoint` canonical; report raw-field duplicates before constraints                                                                    | DZ local/international plus configured countries pass table tests                      |
| Concurrent duplicate prevention      | Unique `ContactPoint` and serializable inbound resolution                                           | Partial     | Preserve unique key; add checked ownership invariant                          | Catch P2002/P2034 in all create/update paths                                | Clear matched/conflict result              | None                                              | Medium                                                            | Route manual lead/client creation through the same resolver                                                                                      | Concurrent creates yield one contact authority and no lost interaction                 |
| Known-number interactions            | Calls and WhatsApp link to prospect/client via resolver; webhook inbox is idempotent                | Partial     | Allow one contact authority to retain lead and client ownership               | Deterministic client/lead/both/ambiguous policy                             | Show match banner                          | CRM/call permissions                              | Medium                                                            | Client-only: client; lead-only: lead; both: retain both, client primary; ambiguous legacy: store event unassigned and create reconciliation task | Every event persists once and returns matched/ambiguous metadata                       |
| Assignment                           | Active same-tenant user validation exists                                                           | Partial     | Optional assignee capability marker                                           | Validate Commercial/Agent capability, not merely active user                | Assignee picker                            | Assignment permission                             | Medium: roles are dynamic                                         | Authorize by permission/capability and organization                                                                                              | Invalid/inactive/wrong-tenant assignees rejected                                       |
| Follow-up tasks                      | `nextActionAt`, tasks, notifications, several dedupe keys                                           | Partial     | Add stable automation key on task                                             | One idempotent follow-up projector                                          | Overdue badge and task link                | Tasks assign/read                                 | Medium                                                            | Upsert by tenant+automation key; cancel superseded task safely                                                                                   | Replays create no duplicate task/notification                                          |
| Atomic Lead-to-Client conversion     | Transaction moves contacts/tasks and links unique `prospectId`                                      | Partial     | Preserve origin relation; add conversion audit/idempotency fields if needed   | Serializable retry, identity-safe client reuse, no plaintext passport       | Conversion result/link                     | CRM convert plus client create; identity separate | High: race can hit unique error; matching existing client unclear | Lock/retry, resolve contact first, return existing conversion, retain lead contact/history links                                                 | Repeated/concurrent conversion returns one client and preserves lead/history           |
| Client/Dossier cardinality           | Client has many dossiers                                                                            | Complete    | None                                                                          | Preserve                                                                    | Surface all dossiers                       | Dossier read                                      | Low                                                               | Keep current ownership                                                                                                                           | One client can create and view multiple independent dossiers                           |
| Configurable country/nationality     | Free-text fields; Algeria-specific NIN rule                                                         | Partial     | Country/nationality reference data                                            | Validate codes, retain legacy text                                          | Reference selectors                        | Reference-data manage                             | Medium                                                            | Expand references and reconcile free text                                                                                                        | Non-Algerian clients supported without code changes                                    |
| Optional restricted identity         | Encrypted NIN/passport, blind hashes, masked default response, reveal audit                         | Partial     | Remove/deprecate plaintext `passportNumber`; link scans through GED           | Conversion must use sensitive service; granular document access             | Identity tab                               | Separate reveal/list/preview/download permissions | High: legacy plaintext may exist                                  | Backfill encryption, verify, then stop reads/writes to plaintext column                                                                          | General APIs never return raw identity; access is audited                              |
| Client detail tabs                   | Profile has summary and unified timeline                                                            | Partial     | Mostly query/projection work                                                  | Add permission-aware tab endpoints                                          | Add requested eight tabs                   | Per-domain tab permissions                        | Low/medium                                                        | Compose canonical services; do not duplicate data                                                                                                | Tabs hide and deny unauthorized data server-side                                       |
| Physical file authority              | `FileAsset` stores private storage metadata/checksum                                                | Partial     | Extend encryption/scanning/integrity state                                    | Reuse storage abstraction                                                   | None                                       | Low                                               | Keep `FileAsset` as blob authority                                | One asset can serve multiple logical uses without copying bytes                                                                                  |
| Logical GED document                 | `DossierDocumentAsset` mixes logical document/link/current file                                     | Missing     | Add logical document, version, typed link, metadata tables                    | Central GED service                                                         | Replace document workspace incrementally   | Granular GED permissions                          | High                                                              | Add structures, backfill, reconcile, controlled read/write switches                                                                              | One logical document has versions and FK-safe entity links                             |
| GED entity links                     | Dossier/client links exist; customs/photo tables separate; `BusinessDocument` generic link lacks FK | Conflicting | Add explicit link tables for supported entities                               | Link/unlink validation                                                      | Entity-aware link UI                       | Link/unlink permissions                           | High                                                              | Use explicit nullable-FK link tables or per-entity join tables; retire generic reads later                                                       | No dangling link; tenant equality verified                                             |
| GED metadata/status                  | Kind/type/title/description/status only                                                             | Missing     | Category/type refs, issuer/dates/sensitivity/validator/history                | Central transition/expiry derivation                                        | Metadata editor/status filters             | Validate/reject permission                        | Medium                                                            | Store validation status; derive effective Expired from expiry date                                                                               | Stored validation and derived expiry cannot contradict                                 |
| GED append-only versions             | Replacements currently create unrelated assets or replace photo links                               | Missing     | `DocumentVersion` unique(document, version), explicit current pointer         | Transactional append and audit                                              | Version history                            | Create-version permission                         | High                                                              | Never update historical version; archive only                                                                                                    | N replacements yield N preserved versions and one current version                      |
| Preview/download security            | Authenticated attachment download; integrity verified                                               | Partial     | Add access/integrity/scanning state                                           | Inline preview with sandbox headers; separate authorization; audit failures | Safe PDF/image preview                     | Separate list/preview/download                    | Medium                                                            | Same-origin active content forbidden; short-lived provider URLs when applicable                                                                  | Sensitive preview/download denied and audited; corrupted file not served               |
| Encryption at rest/malware           | Deployment volume is private; app has SHA-256; no malware scanner; volume encryption not proven     | Missing     | Optional provider encryption metadata/scanning state                          | Scanner adapter and quarantine                                              | Scan status                                | Security/admin                                    | Medium                                                            | Use host/provider AES-256-equivalent encryption; ClamAV/provider scanner; no custom crypto                                                       | Infra evidence and EICAR/quarantine test pass                                          |
| Dossier checklist                    | Service accepts caller-supplied required type list; some workflow gates                             | Partial     | Configurable rule/checklist tables                                            | Rule evaluator and idempotent projector                                     | Progress/missing/expiry UI                 | Checklist manage/view                             | High: hardcoded legacy gates                                      | Store rules by dossier traits/stage, simulate before blocking                                                                                    | Correct states/tasks; only approved rules block transitions                            |
| GED migration reconciliation         | One earlier file-ownership migration probe exists                                                   | Partial     | New migration bookkeeping                                                     | Read-only and filesystem reports                                            | Admin report                               | Migration operator only                           | High                                                              | Use preflight in `backend/scripts/erp-v2-preflight-readonly.sql`, add filesystem checker before Phase 2                                          | Asset/link/count/checksum/tenant reports reconcile before switch                       |
| Supplier central entity              | `Partner(type=supplier)` links offers/purchases/vehicles/payments                                   | Partial     | Extend Partner; do not create Supplier duplicate                              | Supplier-focused facade                                                     | Supplier tabs/detail                       | Partner read/write                                | Medium                                                            | Keep Partner canonical and add supplier profile relations                                                                                        | Existing supplier IDs remain valid in every module                                     |
| Supplier lifecycle/details           | Basic contact, terms, status                                                                        | Missing     | Profile, contacts, Incoterm, lead time, currency, status refs                 | Validation/workflow                                                         | Forms/tabs                                 | Verify/suspend permissions                        | Medium                                                            | Add normalized contacts and supplier profile                                                                                                     | Requested fields and lifecycle transitions available                                   |
| Supplier bank details                | None                                                                                                | Missing     | Encrypted bank-detail version table                                           | Sensitive service and audit                                                 | Restricted section                         | Finance/Direction list/reveal/change              | High                                                              | Envelope encryption with keys outside DB/source; append audit metadata only                                                                      | Unauthorized APIs reveal nothing; changes fully audited                                |
| Supplier incidents/score/KPIs        | Basic counts only                                                                                   | Missing     | Incident and score history                                                    | Derived KPI queries                                                         | Tabs/cards                                 | Incident/score permissions                        | Medium                                                            | Store score inputs/history; derive totals/balance from canonical records                                                                         | KPI calculations are reproducible and tenant-scoped                                    |
| China offer fields/status            | Core vehicle/prices/validity/quantity/photos exist                                                  | Partial     | Add supplier ref, incoterm, location, terms, optional VIN, V2 status          | Transition service                                                          | Extend forms/actions                       | Offer validate/reject                             | Medium                                                            | Extend existing `ChinaOffer`                                                                                                                     | V2 fields and transitions pass tests                                                   |
| Supplier vs customer price authority | Offer stores editable purchase/CIF/DDP                                                              | Conflicting | Deprecate offer CIF/DDP authority; add quotation/tarification                 | Customer prices calculated elsewhere                                        | Clearly separate supplier/quotation prices | Margin permissions                                | High                                                              | Preserve legacy values for history; stop using them as final-price authority after quotation switch                                              | Customer price derives from quotation cost snapshot                                    |
| Offer immutable price history        | Updates overwrite prices                                                                            | Missing     | Offer revision/price history                                                  | Append on price/term change                                                 | History view                               | Offer write                                       | Medium                                                            | Version every commercial change; keep offer identity stable                                                                                      | Previous price cannot be edited/deleted                                                |
| Assign offer/Create purchase         | Reserve/materialize flow is transactional and source-linked through reservation                     | Partial     | Add explicit offer source/revision on purchase                                | Make both actions idempotent                                                | Expose V2 actions/result                   | Purchase permissions                              | Medium                                                            | Reuse reservation/materialize code with source key                                                                                               | Retries return same dossier/purchase and preserve source revision                      |
| Contracts & collections              | Invoice, order, payment plan, payment, signed-contract document gate exist; no Contract aggregate   | Partial     | Add Contract linked to client/dossier; schedule; GED link                     | Contract workflow and canonical balance projection                          | Reframe billing navigation                 | Contract sign/validate/read                       | High                                                              | Contract becomes customer commitment; invoice remains optional                                                                                   | Signed contract, deposit, multiple validated payments and balance work without invoice |
| Central finance journal              | Separate Payment/SupplierPayment/Cost tables                                                        | Missing     | Immutable `FinanceTransaction` journal/source keys/party/account links        | Domain event projectors and reconciliation                                  | Finance transaction UI                     | Post/validate/reverse                             | Very high                                                         | Journal is canonical movement authority; legacy modules project to it during migration                                                           | Exactly one journal transaction per source event; reconciliation is zero               |
| Direct vs operating costs            | `Cost.type` and optional dossier links                                                              | Partial     | Explicit scope/category reference                                             | Validation and reports                                                      | Separate entry/report views                | Cost permissions                                  | Medium                                                            | Keep Cost input aggregate, project validated rows to finance journal                                                                             | Operating expenses cannot affect dossier margin                                        |
| Dossier financial summary            | Finance service computes several totals from existing records                                       | Partial     | Journal indexes/projection                                                    | Recalculate from validated canonical records                                | Summary cards                              | Finance read/margin                               | Medium                                                            | One query/projection, no editable totals                                                                                                         | Totals, payables, margin and percentage match ledger fixtures                          |
| Supplier multi-payments              | Multiple supplier payments and reversal exist                                                       | Partial     | Payment stage/type; journal link                                              | Balance projection                                                          | Deposit/complement/final labels            | Finance                                           | Low/medium                                                        | Extend existing supplier payments                                                                                                                | Total paid/payable uses validated non-reversed movements                               |
| Treasury accounts/balances           | Exchange rates exist; no account model/ledger                                                       | Missing     | Treasury account, journal entry, transfer pair                                | Atomic balanced posting and historical rate snapshot                        | Accounts/transfer UI                       | Treasury permissions                              | Very high                                                         | Add account ledger; never editable balance column                                                                                                | Balance equals validated entries; transfer posts balanced pair                         |
| Financial immutability               | Confirm/reverse flows exist; several records remain directly updateable                             | Partial     | Original/reversal links and DB guards where practical                         | Reject update/delete after validation                                       | Disable edit; reversal flow                | Finance/Direction                                 | High                                                              | Application invariant plus append-only journal                                                                                                   | Validated row only changes via authorized reversal/correction                          |
| Maritime shipment                    | Shipment/container/B-L/vessel/ports/dates/multi-vehicle/history exist                               | Partial     | GED links and stricter constraints                                            | Transition rules, documents, automation                                     | Detail tabs                                | Shipment permissions                              | Medium                                                            | Extend existing Shipment                                                                                                                         | Multi-vehicle shipment and arrival history work with valid transitions only            |
| Customs per vehicle/dossier          | Optional shipment/vehicle/dossier links                                                             | Conflicting | Make required after reconciliation; unique tenant+vehicle+dossier active file | Create-from-shipment and consistency checks                                 | V2 table/detail/actions                    | Customs assign/transition                         | High: existing nullable/duplicates possible                       | Report first; backfill only unambiguous; no silent merge                                                                                         | Exactly one customs file per vehicle/dossier; links agree with shipment                |
| Customs V2 workflow                  | History exists but arbitrary strings/transitions accepted                                           | Missing     | Status expansion/reference if configurable                                    | Central transition service                                                  | Status stepper/filter                      | Transition permission                             | Medium                                                            | Exact state machine with actor/from/to/time                                                                                                      | Invalid transitions rejected; release/exit dates set deterministically                 |
| Arrival/delivery automation          | No shipment-arrival customs/task projector                                                          | Missing     | Automation keys                                                               | Idempotent proposal/create/notify and delivery handoff                      | Proposal/action UI                         | Operations assignment                             | Medium                                                            | Event outbox/projector; do not auto-create ambiguous files                                                                                       | Replay creates no duplicates; every vehicle handled or reported                        |
| Reporting/localization/pagination    | Phase3 reports, French labels, many paginated APIs; some endpoints unpaginated                      | Partial     | Reporting indexes                                                             | Standard query DTOs                                                         | Consistent French labels                   | Report/export                                     | Medium                                                            | Migrate each list to bounded pagination and canonical projections                                                                                | Load tests use indexes; no 100-row UI workaround                                       |
| Audit safety                         | Global audit stores changed field names; several explicit redacted events                           | Partial     | Add event taxonomy/access logs                                                | Audit sensitive views/denials/integrity without payloads                    | Permission-aware history                   | Audit/sensitive-audit                             | Medium                                                            | Central audit writer with allowlisted metadata                                                                                                   | Tests prove secrets/PII/document data never enter audit/logs                           |
| Production backup/deploy             | Encrypted DB+document backup and restore scripts; migration gate                                    | Partial     | Include new volumes/scanner configuration                                     | Add pre/post migration verification                                         | None                                       | Operator                                          | Medium                                                            | Keep manual deployment and restore drill; add V2 reconciliation gates                                                                            | Verified backup and disposable restore precede migration                               |

## Canonical ownership and module boundaries

| Concern                      | Canonical owner                                                                     | Consumers                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Tenant and user capability   | Organization, User, Role, Permission                                                | Every module                                          |
| Pre-client sales person      | Prospect                                                                            | CRM, calls, WhatsApp, tasks                           |
| Customer identity            | Client                                                                              | Dossiers, contracts, collections, documents           |
| Phone/email identity         | ContactPoint plus explicit owner links                                              | CRM, clients, call center, WhatsApp                   |
| Transaction/case             | Dossier                                                                             | Contracts, purchase, logistics, customs, direct costs |
| Supplier                     | Partner with supplier profile                                                       | Offers, purchases, vehicles, finance, GED, incidents  |
| Supplier commercial proposal | ChinaOffer plus immutable revisions                                                 | Sourcing, quotation, purchase                         |
| Customer price               | Quotation/Tarification aggregate (new)                                              | Contract and margin projection                        |
| Customer commitment          | Contract (new)                                                                      | Collections, dossier, optional invoice                |
| Physical bytes               | FileAsset                                                                           | GED versions, photos, evidence                        |
| Logical business document    | GED Document (new evolution of current document layer)                              | All domain modules through typed links                |
| Financial movement           | FinanceTransaction journal (new)                                                    | Finance, treasury, balances, margins, reports         |
| Exchange rate evidence       | Immutable rate snapshot on FinanceTransaction, optionally sourced from ExchangeRate | Finance/reporting                                     |
| Shared ocean movement        | Shipment                                                                            | Vehicles, GED, costs, customs                         |
| Per-vehicle clearance case   | CustomsFile                                                                         | Dossier, shipment, vehicle, GED, costs, tasks         |

Domain modules may keep operational aggregates, but must reference the canonical owner and emit an idempotent source event. They must not store editable copies of document bytes, party details, finance totals, or normalized phone identities.

## Workflow decisions

### CRM

Target happy path: `NEW -> CONTACTED -> QUALIFIED -> APPOINTMENT -> CONTRACT -> DEPOSIT -> CONVERTED`.

`LOST` is retained as an orthogonal close outcome because current production logic supports loss and reopening while the requested graph does not. It must not be deleted or silently mapped. `CONTRACT`, `DEPOSIT`, and `CONVERTED` should be driven by successful domain transactions, not arbitrary UI patches. Existing statuses remain readable until a reviewed mapping report has zero unresolved rows.

### GED

Validation path: `TO_VALIDATE -> VALIDATED` or `TO_VALIDATE -> REJECTED`; replacement creates a new version and returns the logical document to `TO_VALIDATE` when policy requires it. `EXPIRED` is an effective state derived from `expiryDate` plus validation state, not an independently editable contradictory flag. Archive is reversible metadata; initial V2 never physically deletes historical production bytes.

### Supplier and offer

Supplier: `TO_VERIFY -> VERIFIED -> ACTIVE -> SUSPENDED`, with an authorized route from suspended back to verified/active. Offer: `RECEIVED -> UNDER_VERIFICATION -> VALIDATED -> RESERVED`, with terminal `REJECTED` and date-derived `EXPIRED`. Price/term changes append a revision.

### Contract and finance

Contract: draft preparation, signed, deposit pending/received, partially paid, paid, cancelled by authorized reversal policy. Totals are projections of validated collections. Finance movements progress `DRAFT/PENDING -> VALIDATED -> REVERSED`; validated fields are immutable. A correction is a linked reversing entry and, when needed, a new correcting entry.

### Shipment and customs

Shipment transitions are centralized through booked/loading/in-transit/arrived and a closed/delivered outcome. Customs uses the exact requested ordered workflow. Arrival emits an idempotent proposal event for every shipment vehicle; ambiguous dossier membership becomes an operations task, never a guessed customs file.

## Phone normalization and duplicate resolution

1. Preserve `displayValue`; normalize to E.164-like canonical form.
2. Algerian `0XXXXXXXXX`, `213XXXXXXXXX`, `00213...`, and `+213...` normalize to `+213...` only after national-number validation.
3. Non-Algerian numbers require `+`/`00` or a configured default country; country rules are reference data/configuration, not hardcoded UI behavior.
4. `ContactPoint(organizationId, kind, normalizedValue)` remains the concurrent uniqueness authority.
5. Before stricter ownership constraints, run the read-only preflight against a restored production backup. Raw `Prospect.phone` and `Client.phone` duplicates are reported by pseudonymous fingerprint only.
6. Resolution behavior:
   - client only: link interaction to Client;
   - lead only: link interaction to Prospect;
   - both: retain both links for history and return Client as primary business record;
   - multiple legacy candidates: persist the webhook/call/message once without person ownership, return `AMBIGUOUS_MATCH`, and create one deduplicated reconciliation task.
7. Never auto-merge people. A privileged reconciliation workflow chooses ownership and records the decision.

## Sensitive-data permission model

The current broad `documents:read/write` permissions are insufficient. Add permissions without renaming existing ones during expansion:

| Resource                          | Actions                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| GED metadata                      | list, read, create, update, link, unlink, archive, audit                            |
| GED bytes                         | preview, download, upload, createVersion                                            |
| GED validation                    | validate, reject                                                                    |
| Sensitive identity                | metadata, preview, download, revealIdentity                                         |
| Supplier bank details             | metadata, reveal, createVersion                                                     |
| Payment evidence                  | metadata, preview, download                                                         |
| Contracts/customs restricted docs | metadata, preview, download                                                         |
| Finance                           | read, post, validate, reverse, treasuryManage, marginRead                           |
| Workflows                         | crmTransition, supplierVerify, offerValidate, shipmentTransition, customsTransition |

Backend authorization must combine permission, tenant, entity relationship, sensitivity classification, and document/file state. Frontend hiding is only a convenience. Sensitive access and significant denial events use allowlisted audit metadata (document ID, classification, action, outcome), never contents, filenames, signed URLs, identity values, bank details, or evidence data.

## Migration, backfill, and reconciliation plan

Every phase uses the following release sequence:

1. **Expand**: add nullable columns/tables, non-unique indexes, new permissions, and compatibility code. Do not remove old reads/writes.
2. **Report**: run read-only conflict queries on a restored production backup and on production under an approved operator procedure. Save counts in the change record, not sensitive row data.
3. **Backfill**: run restartable, bounded batches with stable cursors and a migration-run identifier. Ambiguous rows go to a reconciliation table/report.
4. **Verify**: compare counts, ownership, tenant consistency, checksums, sums, and workflow mappings. A non-zero unexplained delta blocks release.
5. **Switch reads**: feature flag by organization; observe reconciliation metrics.
6. **Switch writes**: new authority plus compatibility projection to legacy consumers where needed. Use source/idempotency keys.
7. **Contract later**: only after an observation window, backup/restore drill, and explicit approval. Drop/NOT NULL/unique operations are separate migrations.

Phase ordering must remain CRM, GED, suppliers/offers, contracts/finance, shipping/customs, integration. Finance document links wait for GED; supplier payments wait for central supplier identity; customs automation waits for shipment/dossier/vehicle reconciliation.

## Indexes and constraints planned

- CRM: tenant+V2 status+createdAt; tenant+assignee+status; tenant+channel/source; tenant+nextActionAt; contact canonical unique key retained.
- GED: unique document+version number; unique typed entity link; tenant+status+expiry; tenant+sensitivity; unique current-version relationship enforced after reconciliation.
- Suppliers/offers: tenant+supplier status; normalized contact indexes; unique offer+revision; tenant+offer status+validity.
- Finance: unique tenant+source module+source record+idempotency key; account+validatedAt; dossier+type+validatedAt; original/reversal uniqueness; immutable posting guards after dual-write verification.
- Customs: unique active tenant+vehicle+dossier; shipment+status; responsible user+status; declaration reference scoped by tenant.
- All cross-entity writes validate matching `organizationId`; composite database foreign keys should be introduced where Prisma schema design permits them without duplicating identity.

## Rollback strategy

- Expand and backfill releases roll back by disabling V2 reads/writes; additive tables/columns remain in place.
- Never reverse a production migration by dropping populated V2 structures. Forward-fix instead.
- If dual-write reconciliation diverges, stop the V2 writer, retain the idempotent event/outbox rows, repair, and replay.
- If GED integrity/scanning fails, quarantine affected versions and serve neither preview nor download; legacy bytes remain untouched.
- If finance reconciliation diverges, stop validation/posting, not read-only reporting. Never edit validated journal rows.
- Before every phase, produce an encrypted database plus private-document backup and pass a disposable restore drill.

## Exact continuation plan

### Phase 1 release set

1. Add reference data for entry channels, marketing sources, countries, and phone countries; add nullable V2 lead fields and `legacySource` preservation.
2. Add a read-only CRM reconciliation service/report and tests. No unique/NOT NULL change yet.
3. Centralize phone normalization and owner resolution; route manual lead/client creation and webhooks through it.
4. Add the V2 workflow service/history behavior and reviewed legacy mapping.
5. Make conversion serializable, retry-safe, identity-safe, and audit-complete; retain lead ownership links.
6. Add idempotent follow-up task projection and filters/indexes.
7. Update shared contracts and French UI forms, pipeline, filters, match responses, and client tabs.
8. Run full validation and stop at the Phase 1 boundary.

### Later releases

- Phase 2: central GED expand/backfill/verify/read switch/write switch; no legacy deletion.
- Phase 3: extend Partner supplier profile and ChinaOffer revisions; introduce quotation authority.
- Phase 4: Contract aggregate, finance journal, treasury accounts, dual-write reconciliation.
- Phase 5: strict Shipment/Customs workflows, one-per-vehicle/dossier reconciliation, arrival/delivery automation.
- Phase 6: cross-module denial tests, audit review, performance/index review, release runbook and operator smoke tests.

## Operator commands (manual only)

These commands are examples for an operator. Confirm the database identity first. Do not point them at production until backup and change approval are complete.

Read-only preflight against a restored backup:

```bash
psql "$READ_ONLY_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file=backend/scripts/erp-v2-preflight-readonly.sql
```

Repository validation (no seeds):

```bash
cd backend
npx prisma validate
npx eslint "{src,test}/**/*.ts"
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
cd ../frontend
npm run lint
npm test
npm run test:text
npm run build
cd ..
git diff --check
git status --short
```

Read-only deployment inspection:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml images
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

No deploy command is provided at Phase 0 because no V2 runtime migration exists yet. The existing deployment and backup instructions remain in `docs/production-deployment.md`.

## Known limitations and infrastructure requirements

- No central GED versions/categories/rules/scanning service yet.
- No supplier bank-detail vault, incident model, or scoring model.
- No Contract aggregate, finance journal, or treasury account ledger.
- No real telephony/WhatsApp provider; production adapters remain disabled.
- Redis is not currently a durable worker/outbox system.
- At-rest encryption depends on deployment storage/host controls and is not demonstrated by the repository.
- Malware scanning is absent and is a required Phase 2 infrastructure dependency.
- HTTPS/TLS, private non-public storage, external key management/secrets, monitoring, alerting, off-site encrypted backups, and restore drills are mandatory.

## Phase 0 acceptance result

- Repository and existing V2-adjacent implementations inspected: complete.
- Canonical owners and module boundaries defined: complete.
- Workflow, finance, GED, phone, sensitive permissions, migration, indexes, rollback decisions defined: complete.
- Read-only conflict/reconciliation preflight added: complete.
- Business phases changed: none by design; next safe boundary is the complete Phase 1 release set above.

## Phase 0 delivery report

1. **Executive summary:** the current ERP is a solid V1 foundation, while the requested V2 requires five gated business releases. No production data or runtime behavior changed in Phase 0.
2. **Requirement matrix:** the matrix above records Complete, Partial, Missing, or Conflicting status and the impact, risk, proposal, and acceptance criteria for every grouped V2 requirement.
3. **Architecture decisions:** canonical ownership, boundaries, phone resolution, workflow derivation, finance journal, GED versioning, and tenant rules are defined above.
4. **Entity and workflow changes:** none applied yet; target changes and state machines are specified above.
5. **Database migrations:** none created or applied; Phase 1 starts with an additive expansion migration only after preflight review.
6. **Backfill/reconciliation scripts:** `backend/scripts/erp-v2-preflight-readonly.sql` was added; it performs no writes and emits no raw sensitive identifiers.
7. **API changes:** none in Phase 0.
8. **Frontend changes:** none in Phase 0.
9. **Permission matrix:** the additive sensitive/GED/finance/workflow permission actions are defined above; existing permissions remain intact until their replacements are deployed and assigned.
10. **Audit events:** no new runtime events in Phase 0; the allowlisted target event policy is defined above.
11. **Tests and exact results:** backend `npm test -- --runInBand`: 43/43 suites and 223/223 tests passed in 83.725 seconds; Prisma validation and backend build passed. Frontend: ESLint 0 errors/13 legacy-fixture warnings; 12/12 test files and 28/28 tests passed; UI text check passed; TypeScript and production build passed with 28 routes. New-document Prettier check, read-only SQL mutation scan, and `git diff --check` passed. Backend baseline ESLint remains 546 errors/19 warnings and baseline Prettier remains 200 files. Database-backed E2E and integration tests were skipped because the ignored local database target was not proven disposable.
12. **Affected files:** this audit document and `backend/scripts/erp-v2-preflight-readonly.sql` only.
13. **Known limitations:** listed above; no V2 business phase is claimed complete.
14. **Infrastructure:** TLS, encrypted private storage, external secret/key management, malware scanning, monitoring, off-site encrypted backups, and restore drills are required.
15. **Production backup:** pause writes in an approved maintenance window, set `BACKUP_MAINTENANCE_CONFIRMED=yes`, run `deploy/scripts/backup.sh`, run `deploy/scripts/verify-backup.sh`, copy off-site, and prove a disposable restore before migration.
16. **Deployment order:** backup/restore drill; read-only preflight; reviewed reconciliation; additive migration; backend compatibility release; backfill; verification; flagged read switch; flagged write switch; observation; later contract migration. No V2 deployment is authorized at Phase 0.
17. **Read-only pre-deployment commands:** provided in the operator-command section above.
18. **Post-deployment smoke tests:** when a later phase is deployed, verify `/health`, login/session, two-tenant denials, the changed workflow happy and invalid paths, idempotent replay, sensitive-data denial, audit redaction, reconciliation counts, private-file integrity, and rollback flag behavior.
19. **Rollback:** Phase 0 rollback is removal of its two untracked documentation/preflight files. Later phases use feature-flag rollback and forward fixes; populated tables are never dropped to roll back.
20. **Remaining work by priority:** P0—Phase 1 reconciliation/identity/conversion safety and elimination of destructive lead/client deletion; P1—central GED and sensitive-document permissions; P1—supplier/offer history and restricted bank details; P1—Contract/finance journal/treasury; P1—strict shipping/customs workflows; P2—cross-module performance, reporting, and deployment hardening.
