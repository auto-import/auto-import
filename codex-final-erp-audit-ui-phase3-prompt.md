# Codex Master Task — Full ERP Release Audit, Dossier UI Repair and Phase 3

## Role

Act as the senior release engineer and full-stack owner of an existing Auto-Import ERP built with Next.js, React, NestJS, Prisma and PostgreSQL.

This is one ordered mission:

1. independently verify everything implemented through Phase 2;
2. fix confirmed release-blocking defects;
3. reproduce the dossier creation/detail experience shown in the four attached visual references;
4. diagnose and fix corrupted/unknown text symbols throughout the UI;
5. implement Phase 3 only after the pre-Phase-3 release gate passes;
6. execute a final database, API, security and real-browser acceptance pass.

Make the code changes and run the validations. Do not return only an audit, plan, sample code or list of recommendations.

## Efficient execution

Work as one primary agent to conserve usage. Do not delegate to subagents unless a blocker makes a bounded parallel investigation essential.

Use the existing session and repository context. Do not remap or summarize the whole repository. Start from the current code, `git status`, implementation trackers and the targeted files named below.

Resolve the mission in the fewest useful tool loops, but never sacrifice database safety, financial correctness, tenant isolation, authentication, document security or browser verification.

## User-visible outcome

The result must be an ERP where:

- every Foundation, CRM/Call Center, Phase 1 and Phase 2 critical flow has independent evidence of correctness;
- the dossier creation wizard and dossier-detail workspace closely match the attached references while using real persisted data;
- French accents and any Arabic text render correctly without unknown glyphs or mojibake;
- Tasks, Notifications, Audit, Dashboard, Reports and Settings are authoritative tenant-scoped Phase 3 modules rather than mock screens;
- all production frontend routes use real APIs;
- a fresh disposable PostgreSQL database can run every migration and deterministic seed with zero drift;
- final API and browser journeys pass before the work is called complete.

## Safety and authorization

You may inspect and edit in-scope repository files, add safe tests, create additive migrations, start local services and use disposable local databases/storage.

You must not:

- commit, push, create a PR or alter remote branches;
- run `git reset`, `git clean`, destructive checkout or discard any existing/untracked work;
- run `prisma migrate reset`, drop an unknown database/schema or modify production data;
- rewrite already-applied migrations;
- treat the previous implementation reports as proof;
- expose passwords, refresh tokens, API keys or storage paths in the frontend/logs;
- use `any`, TypeScript suppressions, disabled guards/validation, fake success, placeholder APIs or mock business data;
- implement real VoIP, WhatsApp, banking, carrier, customs or cloud-storage provider integrations in this mission;
- fix unrelated repository-wide legacy lint debt unless a changed file depends on it.

Before any database mutation, prove from the resolved connection identity that it is the disposable local development/test PostgreSQL instance. If identity is ambiguous, stop database mutation and report the exact blocker.

Preserve the dirty worktree. Existing changes belong to the user.

## Current reported baseline — verify, do not assume

Repository shape:

```text
contracts/
  index.ts
  index.d.ts
backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    auth/ users/ roles/ offices/
    crm/ call-center/
    partners/ vehicles/ warehouses/ offers/
    dossiers/ vehicle-requests/ orders/ purchases/
    finance/ shipments/ customs/ documents/
frontend/
  app/(dashboard)/
  components/
  lib/
docs/
  phase-2-implementation-status.md
```

Reported completed capabilities:

- canonical contracts and Swagger;
- secure access/refresh authentication;
- tenant-aware RBAC, users, roles and offices;
- CRM leads/clients/timelines, call-center and WhatsApp simulators;
- suppliers, vehicles, warehouses, offers, reservations, dossiers, requests, orders and purchases;
- invoices, 30/70 and full-upfront plans, payments/allocations/deposits, supplier payments, costs, exchange rates and margins;
- shipments, customs and private document storage;
- dossier financial gates and Phase 2 frontend routes.

Reported latest migration:

```text
backend/prisma/migrations/20260825140000_erp_phase2_finance_logistics_documents
```

Reported local services:

```text
frontend: http://localhost:3001
backend:  http://localhost:3000/api
health:   http://localhost:3000/health
database container: auto-import-db on localhost:51214
```

Reported development-only seeded administrator:

```text
admin@example.com
AutoImport-Dev-Only-2026!
```

Verify that this credential is confined to deterministic development/test seed behavior and cannot create a known production credential.

Reported validation was 29 backend suites/147 tests, 7 frontend files/17 tests, builds passing and zero drift. Browser automation was explicitly not executed. Treat browser coverage as missing.

## Mandatory stage order and release gates

Follow this order:

- Stage 0 — preserve state and create tracker;
- Stage 1 — independent audit and full pre-Phase-3 verification;
- Stage 2 — fix P0/P1 defects and rerun affected regression suites;
- Gate A — do not start Phase 3 until all P0/P1 findings are resolved or a concrete blocker is documented;
- Stage 3 — dossier UI reconstruction and text/font/encoding repair;
- Gate B — browser-verify the visual and functional changes;
- Stage 4 — implement Phase 3;
- Stage 5 — final full-release verification.

Severity definitions:

- **P0:** data loss/corruption, cross-tenant access, authentication bypass, money misstatement, private-file disclosure or destructive migration risk.
- **P1:** broken core workflow, bypassable gate, incorrect persistence/reconciliation, unusable production route or major regression.
- **P2:** non-blocking UI/accessibility/performance/maintainability issue.

Fix every P0/P1 found in the in-scope system. Fix the requested dossier UI and text rendering even if classified P2. Record unrelated P2/P3 findings without expanding scope.

## Resumable tracker

Create or reuse:

```text
docs/final-release-implementation-status.md
```

Keep it concise:

```markdown
# Final Release Implementation Status

## Preserved baseline
- branch/HEAD:
- dirty paths summarized:
- latest migration:
- disposable DB identity:

## Stages
- [ ] 0 — State preservation
- [ ] 1 — Independent pre-Phase-3 audit
- [ ] 2 — P0/P1 remediation
- [ ] A — Pre-Phase-3 gate passed
- [ ] 3 — Dossier UI and encoding repair
- [ ] B — UI/browser gate passed
- [ ] 4 — Phase 3 implementation
- [ ] 5 — Final release verification

## Findings
| ID | Severity | Evidence | Resolution | Regression test |

## Commands executed
| Command | Exit | Result |

## Current blocker
- none
```

Update it only at stage boundaries. If the task is interrupted, resume from the first incomplete stage without repeating completed repository analysis.

---

# Stage 0 — Preserve and target

1. Read applicable `AGENTS.md`/repository instructions.
2. Capture `git status --short`, `git diff --stat`, the latest migrations and both implementation status documents.
3. Include untracked source files in the inventory; `git diff` alone is insufficient.
4. Do not format or rewrite unrelated files.
5. Detect processes listening on 3000/3001 before starting anything. Do not terminate an unknown process. Reuse verified project processes or use explicitly different ports.
6. Verify the database/container identity before writes.
7. Locate the existing browser-smoke scripts and installed browser/test dependencies before adding packages.

Do not produce a new architecture report. Begin validation after this targeted inventory.

---

# Stage 1 — Independent pre-Phase-3 release audit

## 1. Database and migrations

Against a newly created disposable PostgreSQL database:

- deploy all migrations in order from zero;
- validate and generate Prisma Client;
- run deterministic seed twice to prove idempotency;
- compare the migrated database with `schema.prisma` and require zero drift;
- verify tenant indexes, foreign keys, unique constraints and deletion semantics for all Foundation through Phase 2 models;
- verify migration backfills do not guess ownership or currency;
- ensure production seeding is rejected;
- ensure the Phase 2 private-storage root is a disposable test directory.

Never use the user's normal database for destructive migration experiments.

## 2. Authentication, session and CORS

Test through real HTTP requests, not service mocks only:

- login success/failure;
- canonical `/auth/me` and `/auth/session` contracts;
- HttpOnly/SameSite refresh cookie behavior;
- access-token expiry and one successful refresh retry;
- refresh rotation;
- revoked-token and reused-token rejection;
- logout revocation;
- inactive/deleted user rejection;
- inactive organization rejection;
- origin/CSRF protection on cookie-authenticated mutations;
- explicit credentialed CORS for the configured frontend origin;
- no wildcard CORS with credentials;
- no password hashes, token hashes or secrets in any response/log.

Use the dev credential only in the disposable environment. Create a restricted test user for permission testing.

## 3. RBAC and tenant isolation

Exercise at least two organizations and several roles. For every domain introduced through Phase 2, prove:

- list/detail/filter/search cannot return another tenant's records;
- create/update/delete/transition rejects cross-tenant foreign IDs;
- organization ID is derived from the principal, never trusted from DTOs;
- direct URL/API access cannot bypass hidden frontend controls;
- platform roles are protected from tenant administrators;
- role assignment cannot grant permissions the actor does not possess;
- errors do not disclose whether a foreign record exists.

Cover users, offices, roles, leads, clients, calls, messages, suppliers, vehicles, warehouses, offers, dossiers, requests, candidates, orders, reservations, purchases, invoices, payments, costs, shipments, customs and files.

## 4. CRM and Call Center simulator

Verify through API plus real browser updates where applicable:

- Algerian phone normalization and concurrent contact deduplication;
- known caller/message opens the correct client/lead;
- unknown caller/message creates exactly one lead;
- inbound, queued, assigned, answered, transferred, completed and missed calls;
- available/busy/offline agent presence and recovery after reconnect;
- callbacks, dispositions and next actions;
- inbound/replied/delivery-status WhatsApp simulator events;
- duplicate/out-of-order/replayed webhook idempotency;
- timeline ordering for calls, WhatsApp, notes, relances and appointments;
- per-agent KPIs match underlying records;
- WebSocket authentication and organization/user isolation.

Do not add live provider integrations. Existing simulator behavior remains the release target.

## 5. Phase 1 commerce

Verify:

- supplier CRUD/archive and tenant ownership;
- vehicle CRUD/specifications/photos/locations/stock history/archive;
- warehouse/location/movement ownership and quantities;
- offer derived statuses, reserve/release/expiry and concurrent oversubscription protection;
- materialization of vehicle and purchase from an offer;
- CIF, DDP and shipping-only dossier creation with their canonical initial states;
- dossier reference concurrency;
- assignment ownership;
- request/candidate validation and purchase consistency;
- purchase confirmation idempotency;
- order item/reservation creation and cancellation release;
- cancellation/expiry releases inventory exactly once;
- no transition bypass from procurement/order services.

## 6. Phase 2 finance

Use database-backed concurrency tests, not only mocked Prisma calls:

- decimal-safe line/tax/total calculations;
- concurrent invoice/reference numbering;
- issued invoice immutability and void rules;
- 30/70 rounding where installment two equals total minus installment one;
- full-upfront strategy;
- partial and full allocations;
- overpayment becomes a customer deposit exactly once;
- idempotency keys reject different payload reuse;
- simultaneous payment/allocation requests cannot overallocate;
- pending/failed/reversed money never counts as collected;
- reversal unwinds allocations and balances atomically;
- supplier payment confirmation/reversal;
- historical exchange rate chosen at or before transaction time;
- missing/future/wrong-currency rates are rejected;
- original and reporting currency values remain auditable;
- costs are not double-counted across finance/customs/shipping;
- margin and organization overview reconcile with underlying rows.

## 7. Shipping, customs and dossier gates

Verify:

- canonical valid/invalid transitions and immutable histories;
- duplicate/out-of-order transition handling;
- dossier/vehicle/carrier/container ownership consistency;
- customs valuation/duty/tax/fees reconcile with finance costs;
- cancellation and repeated command behavior;
- 30% or full-upfront purchase gate;
- final-balance delivery gate;
- required contract/document/proof gates;
- shipment/customs gates appropriate to CIF, DDP and shipping-only workflows;
- reversal/removal of qualifying evidence closes a gate where business rules require it;
- direct API calls cannot bypass any gate.

## 8. Documents and private storage

Verify all supported domains:

- vehicle photos;
- business documents;
- dossier documents;
- proofs;
- contracts;
- customs documents;
- payment receipts.

Test:

- empty and oversized upload rejection;
- allowed PDF/PNG/JPEG/WEBP signatures;
- declared MIME/extension mismatch;
- corrupt and unsupported magic bytes;
- unsafe filename and path traversal;
- opaque storage keys and no public absolute paths;
- authenticated streaming download;
- cross-user/cross-tenant access denial;
- archive/delete semantics;
- checksum and duplicate behavior;
- failed-upload temporary-file cleanup;
- orphan cleanup;
- persistence after application restart.

## 9. Static and API validation

Run the repository-supported equivalents of:

- Prisma validate/generate/fresh deploy/drift/seed;
- backend unit/integration tests;
- backend E2E tests;
- frontend component tests;
- backend and frontend TypeScript checks;
- backend and frontend production builds;
- lint for every changed/in-scope production and test file;
- `git diff --check`;
- OpenAPI generation and contract tests.

Search production files for remaining mock imports, fabricated metrics, hardcoded rates/dates/totals, `any`, TypeScript suppressions, disabled validation and placeholder TODO implementations.

## 10. Mandatory real-browser acceptance before Gate A

Static generation and curl probes do not count as browser verification.

Use the installed Chrome/Chromium and existing browser-smoke approach. If the existing runner is broken, repair it without adding a large new framework when a lightweight script is sufficient.

In a real browser:

1. log in and restore session after reload;
2. create/edit an office, role and restricted user;
3. create a lead, add timeline activity and convert it to a client;
4. simulate known and unknown inbound call/message flows;
5. create supplier/offer/vehicle data;
6. create CIF, DDP and shipping-only dossiers;
7. reserve/confirm/cancel commerce records and verify release;
8. create a payment plan, invoice, payment, cost and supplier payment;
9. create/progress a shipment and customs file;
10. upload/download an authorized document;
11. prove a blocked dossier transition and then a successful transition after satisfying the gate;
12. reload pages and verify persistence;
13. log in as the restricted user and verify hidden controls plus direct-route/API denial;
14. verify no console errors, hydration errors, failed network requests or mock fallback data.

Record screenshots or deterministic browser assertions for key steps.

---

# Stage 2 — P0/P1 remediation

For every P0/P1 found in Stage 1:

1. record the exact reproduction and affected invariant in the tracker;
2. add or strengthen a regression test that fails for the defect;
3. implement the smallest architecture-consistent fix;
4. run the focused test, its domain suite and any affected cross-domain/browser flow;
5. review the resulting diff for tenant, permission, transaction and error-envelope regressions;
6. mark the finding resolved only when the regression test passes.

Do not use broad rewrites, migration resets, relaxed validation, fake test doubles for database concurrency, or frontend-only checks for backend invariants.

## Gate A

Phase 3 may start only when:

- every P0/P1 finding has a regression test and passes;
- fresh migrations and zero drift pass;
- authenticated HTTP and browser smoke pass;
- the Phase 2 money, workflow and document-security checks pass;
- unresolved blockers, if any, are explicit.

If Gate A cannot pass, stop before Phase 3. Finish the report with the blocker and exact reproduction evidence.

---

# Stage 3 — Dossier UI reconstruction and text-rendering repair

The four images attached with this prompt are authoritative visual references. They are references for structure, spacing, hierarchy and states—not a source of fake dossier data.

Inspect the images at original detail before editing. Render and compare the implementation at desktop and smaller widths after editing.

## A. Dossier creation wizard

Update the real API-backed dossier creation route, expected near:

```text
frontend/app/(dashboard)/dossiers/creer/
```

Reproduce these characteristics:

- page heading `Nouveau dossier` with subtitle `Création d'un dossier d'importation`;
- centered five-step progress indicator:
  1. Type de dossier
  2. Client
  3. Véhicules
  4. Équipe
  5. Récapitulatif
- current step: black filled circle and bold black label;
- completed step: pale green circle/check and readable completed label;
- future steps: white/light circle, gray label and subtle connector;
- large centered white card with fine neutral border, rounded corners and generous spacing;
- consistent footer divider with `Précédent` left and black `Continuer` right;
- disabled navigation is visibly disabled and inaccessible to keyboard activation.

Step 1 must show three full-width selectable cards:

- CIF;
- DDP;
- Expédition seule.

Each card contains an existing icon from the project's icon system, title, compact badge, French description and radio selection state. The entire card must be clickable, keyboard accessible and represented as a proper radio group.

Step 2 must show:

- heading and explanatory text;
- segmented choices `Client existant` and `Nouveau client`;
- searchable existing-client selection backed by the real client API;
- a real new-client form backed by the canonical client/lead conversion API;
- preserved form state when moving backward/forward;
- validation errors adjacent to fields;
- no duplicate client creation on double submit.

Apply the same visual system to Vehicle, Team and Summary steps. Preserve all actual CIF/DDP/shipping-only business behavior, offer/external-vehicle handling, assignee permissions and idempotent dossier creation.

The wizard must be responsive: no clipped step labels, broken card widths or horizontal page overflow. On narrow viewports use a compact/scrollable stepper while retaining the current step and accessible labels.

## B. Dossier detail workspace

Update the real dossier workspace, expected near:

```text
frontend/components/commerce/DossierDetailWorkspace.tsx
frontend/app/(dashboard)/dossiers/[id]/
```

Reproduce:

- existing application sidebar and top bar;
- top heading `Dossier d'importation` and compact reference/client/vehicle subtitle;
- white dossier header card with reference, type badge, canonical status badge and offer badge;
- client, vehicle, supplier and China/Algeria responsible people displayed from the real aggregate;
- permission-aware `Modifier` and `Avancer le statut` actions;
- horizontal workflow timeline using the workflow belonging to the dossier type;
- completed nodes as black circles/checks;
- current node as a black ring/current marker;
- future nodes light gray and non-interactive;
- readable French status labels;
- horizontal scrolling or a compact responsive presentation when all statuses do not fit;
- tab row for overview, client, vehicles, purchase, shipping, finance, documents, photos/proofs, tasks, timeline and notes, but only when the corresponding domain/permission applies;
- active tab with dark text and underline;
- no data loss when switching tabs.

Show a pale amber blocking banner only when a real backend gate is unmet. It must contain:

- the missing requirement;
- why advancement is blocked;
- a permission-aware action taking the user directly to the relevant upload/payment/shipping/customs UI.

Do not hardcode a `Contrat signé requis` banner. Derive it from the backend gate response.

The overview must use real values for type, status, contract, assignees, creation date, supplier, offer and vehicle count. Revenue, cost and margin cards must use the authoritative finance summary and display the correct currency—not `$0` placeholders.

Keep the visual style restrained like the references: neutral background, white cards, thin borders, black primary actions, blue informational badges and amber blocking states. Reuse existing design tokens/components before creating new ones.

## C. Unknown symbols, mojibake and font diagnosis

The user reports that some words render as unknown symbols. Diagnose the cause before selecting a fix.

Inspect:

- affected DOM text versus raw API response;
- browser console/network response headers;
- source file encodings;
- database strings;
- JSON serialization and `Content-Type` charset;
- Next root layout and global font loading;
- CSS font-family/fallback declarations;
- icon rendering that incorrectly relies on font glyphs/Unicode symbols.

Search source and persisted test data for common corruption markers:

```text
Ã  Â  â€™  â€“  â€”  �  \uFFFD
```

Repair rules:

- keep source, seed, API and database text UTF-8 end to end;
- ensure JSON/text responses declare UTF-8 where applicable;
- use a font stack with Latin/Latin Extended support for French;
- if Arabic UI content exists, provide an Arabic-capable fallback and correct RTL only for Arabic content;
- use the existing SVG/icon component library instead of Unicode icon glyphs;
- do not remove French accents to hide encoding problems;
- do not blindly rewrite database text;
- if persisted mojibake exists, create only a deterministic reviewed repair/backfill with tests and exact affected-row reporting;
- avoid remote runtime font dependencies when an existing bundled/local font can provide reliable builds.

Add a small rendering regression fixture containing at least:

```text
Création d'un dossier d'importation
Véhicules
Équipe
Récapitulatif
Expédition seule
Responsable Algérie
Coût total
Contrat signé
```

If Arabic is part of the current UI, include a representative Arabic phrase and verify shaping/direction.

## D. UI quality gate

Render and inspect at minimum:

- 1920×1080;
- 1440×900;
- 1366×768;
- a mobile viewport around 390×844.

Check:

- spacing, alignment and hierarchy against the four references;
- no clipped text or overlapping timeline nodes;
- no horizontal page overflow other than intentional timeline/tab scrolling;
- correct loading, empty, validation, forbidden and backend-error states;
- keyboard navigation and visible focus;
- labels/inputs/radio group/tab accessibility;
- correct colors in normal/hover/focus/disabled/current/completed/blocked states;
- zero unknown glyphs, mojibake, hydration warnings and console errors.

Browser-test all five wizard steps, back/forward state retention, failed validation, successful creation, detail reload, tabs, blocked gate action and allowed status advancement.

# Gate B

Gate B passes only after these browser checks and affected frontend tests, type checks and production build succeed. If visual or encoding verification cannot be executed in a real browser, stop before Phase 3 and report the exact blocker.

---

# Stage 4 — Phase 3

Implement Phase 3 only after Gate A and Gate B pass. Reuse any existing CRM/task/notification/audit infrastructure; reconcile and extend it instead of creating duplicate authorities.

## 1. Canonical contracts and permissions

Extend shared contracts and the permission seed only as required for existing/canonical equivalents of:

- tasks read/write/assign;
- notifications read/manage;
- audit read;
- dashboard read;
- reports read/export;
- settings read/write.

Use the existing response envelope, pagination, error mapping, auth principal and French presentation mapping. Do not expose permission catalogs or platform settings to unauthorized tenants.

## 2. Tasks, relances and appointments

Complete the tenant-safe backend and `/tasks` workspace using existing models where possible.

Required behavior:

- create/list/detail/update/complete/cancel/reassign;
- assignee and creator as real tenant users;
- priority, status, type, due date, completion date and notes;
- optional validated links to supported lead/client/dossier/call/appointment entities;
- filters for assignee/status/priority/type/due range/entity;
- overdue calculation using organization timezone;
- idempotent creation from domain events where automatic tasks already exist;
- reminders/next actions integrated with CRM and dossier timelines;
- permission-aware personal/team views;
- pagination, loading, empty, retry and forbidden states.

Do not duplicate CRM appointments or next-action authorities. Define one source of truth and adapt existing data safely.

## 3. Notifications and templates

Complete the backend and `/notifications` plus top-bar unread indicator.

Required behavior:

- tenant/user-scoped inbox;
- unread count;
- mark one/read all;
- notification category, severity, entity link and creation/read timestamps;
- deterministic dedupe key for event-triggered notifications;
- permission-aware tenant notification-template/preferences administration;
- domain events for meaningful workflow/payment/document/task/call events;
- no notification leakage between users or organizations;
- no fake polling counts or hardcoded badges.

Use the existing WebSocket/realtime infrastructure where appropriate. Persist notifications before realtime delivery so reconnects cannot lose them.

## 4. Append-only audit logging

Complete tenant-safe audit capture and query endpoints.

Audit meaningful mutations across administration, CRM, commerce, finance, logistics, documents, settings and status transitions. Store actor, organization, action, resource, resource ID, timestamp and a safe change summary/request correlation where available.

Never record:

- passwords or password hashes;
- access/refresh/API tokens;
- cookies or authorization headers;
- private file bytes;
- unrestricted request bodies;
- secrets from settings.

Audit records are append-only for ordinary application users. Provide filtered/paginated read access only to authorized roles. Redact sensitive values and test the redaction.

## 5. Authoritative dashboard

Replace the dashboard mock data with a tenant-scoped aggregate API and real frontend.

At minimum provide date-range-aware, timezone-correct metrics for:

- dossiers total/active and distribution by canonical status/type;
- vehicle stock by status/source;
- invoice issued/collected/outstanding/overdue in reporting currency;
- revenue, cost and gross margin trend;
- offers available/reserved/sold/expired;
- active leads, pipeline, qualified leads, appointments and conversions;
- call-center calls, missed calls, duration, qualified leads, appointments and conversions per agent;
- active/late shipments and customs files;
- operational alerts derived from overdue invoices/tasks/callbacks, late shipments and unmet dossier gates;
- recent dossiers/events.

Rules:

- derive every KPI from authoritative tables;
- pending/failed/reversed money cannot count as collected;
- convert currencies using historical rates and return decimal strings;
- document denominators and date boundaries;
- avoid N+1 queries and add justified indexes when needed;
- a missing metric returns a real zero/empty result, never fabricated sample data.

## 6. Reports and exports

Complete backend reporting APIs and `/rapports`.

Provide filters and summaries appropriate to the current UI for:

- finance/revenue/collections/cost/margin;
- dossiers/status/type/processing time;
- inventory/offers/purchases/suppliers;
- CRM source/status/temperature/agent/conversion;
- call-center agent performance;
- shipping/customs timeliness.

Exports must:

- enforce the same tenant, permission and filters as the on-screen report;
- stream a deterministic UTF-8 CSV with safe spreadsheet-cell escaping;
- use French-readable headers where the product UI expects French;
- avoid unbounded memory use;
- include report generation metadata/date range/timezone without secrets.

Implement PDF only if an existing dependency and current UI contract require it; do not add a heavy PDF subsystem merely because a placeholder button exists.

## 7. Organization settings

Replace `/parametres` hardcoded form with persisted tenant settings.

Support only settings actually enforced by the application, such as:

- organization display/legal/contact information;
- locale and timezone;
- base/reporting currency with safe restrictions;
- invoice/reference presentation options supported by current numbering authority;
- notification preferences/defaults;
- branding fields supported by the existing document/UI system.

Security rules:

- only authorized organization administrators can update settings;
- changing base currency after posted financial activity must be rejected or handled through an explicit safe migration policy—never silently reinterpret history;
- validate timezone/currency/locale values;
- do not expose or persist secrets in generic settings JSON;
- do not display security controls that have no enforced backend behavior.

Make branding consistent. Prefer organization-configured branding with a safe product default; eliminate conflicting hardcoded names where the real setting is available.

## 8. Final mock and dead-surface cleanup

- Remove production imports of `frontend/lib/mockData.ts` and any Phase 3 hardcoded KPI/settings/notification arrays.
- Keep test fixtures only under test-specific locations.
- Remove dead buttons or implement their real actions.
- Ensure sidebar/topbar navigation is permission aware and includes real Tasks, Notifications, Reports and Settings routes where appropriate.
- Preserve URL compatibility or add safe redirects for legacy routes.
- Do not rewrite completed modules merely for style.

## 9. Phase 3 tests

Add focused backend, frontend and browser coverage for:

- task ownership, assignment, overdue and entity links;
- notification persistence, dedupe, unread counts and isolation;
- audit coverage/redaction/immutability;
- KPI reconciliation against seeded transactions;
- historical currency conversion and reversed-payment exclusion;
- report filters, totals and UTF-8 CSV export escaping;
- settings validation/authorization/base-currency protection;
- loading/empty/error/forbidden frontend states;
- direct-route and cross-tenant attacks;
- realtime notification reconnect without duplication.

---

# Stage 5 — Final release verification

Run a final clean verification after all changes.

## Database

- brand-new disposable PostgreSQL database;
- all migrations deployed from zero;
- Prisma validate/generate;
- zero schema drift;
- deterministic seed twice;
- production seed refusal;
- disposable private-storage directory.

## Automated checks

- all backend unit/integration suites;
- backend E2E;
- all frontend tests;
- backend/frontend TypeScript;
- backend/frontend production builds;
- changed/in-scope lint with zero errors/warnings attributable to this mission;
- contract/OpenAPI tests;
- `git diff --check`;
- no Phase 0–3 production mock imports;
- no committed secret or development password in production configuration;
- report full repository legacy lint separately without turning it into unrelated scope.

## Final real-browser journey

Using the freshly migrated/seeded environment:

1. log in and reload session;
2. verify the dashboard contains database-backed values;
3. create a lead/client and exercise call/message simulator history;
4. create supplier/offer/vehicle and complete the five-step dossier wizard;
5. verify the redesigned dossier detail and timeline;
6. prove financial/document/logistics gates;
7. record finance, shipping, customs and documents;
8. create/complete a task and receive/read its notification;
9. verify audit entries without secret leakage;
10. run a report and download/reopen its UTF-8 CSV;
11. update an allowed setting and verify it after reload;
12. repeat restricted-user and second-tenant isolation checks;
13. inspect browser console and network failures;
14. verify French accented strings and any Arabic strings at all target viewports.

Reconcile representative UI KPIs against direct database/API totals. A rendered page alone is not enough.

Cleanly stop only task-owned temporary servers/containers and remove only task-created temporary databases/storage. Do not delete repository files or the user's existing container/data.

---

# Completion criteria

Do not claim completion unless:

- Gate A and Gate B passed with evidence;
- no unresolved P0/P1 finding remains;
- the dossier wizard/detail behavior and layout match the visual references closely;
- the unknown-symbol issue is root-caused and regression-tested;
- Phase 3 routes use real tenant-scoped APIs and persisted data;
- every dashboard/report value reconciles with authoritative records;
- permissions and tenant isolation cover all new endpoints;
- fresh migration, tests, type checks, builds and real-browser journeys pass;
- no commit or push was made.

Allowed blockers are limited to:

- ambiguous existing data that cannot be migrated without guessing;
- unavailable required local infrastructure after reasonable safe attempts;
- a concrete repository contradiction that risks data loss or incorrect accounting;
- missing user-provided external credentials only for explicitly external providers, which are out of scope here.

If a check was not run, mark it **NOT RUN**. Never turn an unexecuted check into a pass.

# Final response

Return a concise evidence-based report with exactly these sections:

1. **Pre-Phase-3 findings and fixes** — P0/P1/P2 with file locations and regression tests.
2. **Database and security evidence** — disposable identity, migrations, drift, auth/RBAC/tenant results.
3. **Dossier UI and encoding** — root cause, changed components, viewport/browser evidence.
4. **Phase 3 delivered** — Tasks, Notifications, Audit, Dashboard, Reports and Settings.
5. **Validation matrix** — exact commands, exits, suite/test counts and browser scenarios.
6. **Mock/secrets/legacy-debt census** — remaining production mocks, secret scan and unrelated lint baseline.
7. **Remaining blockers** — concrete only, or `none`.

Do not repeat this prompt and do not describe work as complete based only on compilation, static route generation, curl probes or the prior handoff report.
