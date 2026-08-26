# Codex Task — Build and Populate a Safe Realistic ERP Demo Database

## Goal

Create a repeatable, deterministic and production-safe demo-data seeding system for the completed Auto-Import ERP. Populate the development/test database with realistic, internally consistent data covering Foundation, CRM/Call Center, commerce, dossiers, finance, logistics, documents and Phase 3 so that manual UI testing, browser smoke tests, dashboards and reports are meaningful.

This is an implementation task. Inspect the current Prisma schema, migrations, seed configuration and domain invariants; implement the demo seeder; run it against a disposable database; verify the resulting application through APIs and a real browser.

Do not return only sample JSON, SQL, a plan or pseudocode.

## Safety invariants

- Preserve all existing uncommitted work.
- Do not commit or push.
- Never run against staging or production.
- Never use `prisma migrate reset` or drop an unknown database.
- Before any write, prove that `DATABASE_URL` targets a disposable development/test PostgreSQL database.
- Refuse execution when `NODE_ENV` is not `development` or `test`.
- Require an explicit opt-in such as `ALLOW_DEMO_SEED=true`.
- Do not modify, delete or reinterpret existing non-demo records.
- Do not store real personal information, secrets, credentials, passport numbers or payment information.
- Do not use arbitrary organization IDs, cross-tenant relations or invalid workflow shortcuts.
- Do not weaken constraints, guards, TypeScript, lint or tests to make seeding pass.
- Do not create file metadata pointing to nonexistent files.
- Do not call external VoIP, WhatsApp, banking, carrier, customs or email APIs.

## Repository context

Relevant areas include:

```text
contracts/
backend/prisma/schema.prisma
backend/prisma/seed.ts
backend/prisma/migrations/
backend/src/
frontend/app/(dashboard)/
frontend/lib/
docs/final-release-implementation-status.md
```

The ERP currently includes:

- organizations, users, roles, permissions and offices;
- CRM leads/clients, notes, relances, appointments and timelines;
- Call Center and WhatsApp simulators;
- suppliers, warehouses, vehicles, offers, reservations, requests, candidates, orders and purchases;
- CIF, DDP and shipping-only dossiers;
- invoices, 30/70 and full-upfront plans, payments, allocations, deposits, supplier payments, exchange rates, costs and margins;
- shipments, customs and private documents;
- tasks, notifications, audit, dashboard, reports and organization settings.

Reuse the actual canonical enums, workflow definitions, shared contracts, permissions and existing sequence authorities. Do not invent legacy/French database enum values or duplicate domain models.

## Architecture

Keep the existing minimal deterministic seed responsible for schema/bootstrap identities and permissions. Add a separate demo-data entry point, preferably following the repository's existing TypeScript/Prisma script conventions, such as:

```text
backend/prisma/seed-demo.ts
backend/scripts/verify-demo-seed.ts
```

Add package scripts equivalent to:

```json
{
  "seed:demo": "...",
  "seed:demo:verify": "..."
}
```

Do not assume those exact paths or runners if the repository has a better established convention. Inspect first and integrate consistently.

The demo seeder must be:

- idempotent: running it twice produces the same logical records and counts;
- deterministic for the same configuration;
- transaction-safe where multiple related records are created;
- tenant-safe;
- resumable after a failed domain batch;
- explicit about counts and failures;
- independent of external services;
- compatible with a freshly migrated database.

Use stable unique demo identifiers/natural keys or deterministic IDs. Prefix references or metadata so demo-owned rows are recognizable without colliding with production-style sequences. Do not infer demo ownership from a fragile name substring if an existing safe metadata mechanism is available.

Do not add a Faker dependency unless it is already installed and appropriate. A small deterministic data generator/helper is sufficient.

## Required configuration

Support server-only configuration equivalent to:

```env
ALLOW_DEMO_SEED=true
DEMO_SEED_SCALE=small
DEMO_SEED_ANCHOR_DATE=2026-08-25T12:00:00.000Z
DEMO_SEED_PASSWORD=<user-supplied-development-password>
DEMO_FILE_STORAGE_ROOT=<disposable-test-storage-path>
```

Rules:

- `DEMO_SEED_PASSWORD` must be supplied; do not hardcode a reusable password.
- Never print the password.
- Validate `DEMO_SEED_ANCHOR_DATE` and use it consistently for overdue/upcoming/time-series scenarios.
- Default to `small`; optionally support `medium` without changing business meaning.
- Add safe documentation to `.env.example`, never real secrets to tracked `.env` files.

## Realistic demo dataset

Use Algerian/French fictional names and addresses, E.164 Algerian phone numbers and clearly fictional emails/domains. Include French accents and a small valid Arabic-text sample to exercise UTF-8 rendering.

Create two organizations:

1. a primary organization with a rich dataset for UI testing;
2. a secondary organization with a small dataset used to prove tenant isolation.

No relation may cross between them.

### 1. Foundation

For the primary organization create realistic fictional:

- organization settings, locale `fr-DZ`, `Africa/Algiers` timezone and DZD reporting currency;
- at least two offices;
- administrator, manager, commercial agent, call agent, finance employee, logistics employee and read-only employee;
- role assignments using existing canonical permissions;
- active and inactive users for filters;
- no platform-role escalation.

Create equivalent minimal administrator/read-only identities in the secondary tenant.

At the end, print only the demo usernames/emails and roles—not password values, hashes or secrets.

### 2. CRM and Call Center

Create enough varied data for lists, filters, Kanban, timelines and per-agent KPIs:

- leads across every canonical lifecycle/status and Hot/Warm/Cold temperature;
- several sources and assigned agents;
- known and unknown Algerian phone numbers;
- clients converted from leads and direct clients if the domain supports it;
- calls covering queued, answered, transferred, completed, missed and callback scenarios;
- realistic durations, outcomes and next actions;
- WhatsApp inbound/outbound/status histories through the canonical persisted simulator models;
- notes, relances, appointments and status histories;
- at least one overdue callback and one future appointment;
- duplicate provider-event test records only when the domain's idempotency model supports them without duplicating business events.

Ensure timeline order and KPI totals can be manually reconciled.

### 3. Suppliers, warehouses and vehicles

Create fictional Chinese suppliers and carriers with valid partner types, contacts and archival states.

Create:

- warehouses and locations;
- stock movements that reconcile with quantities/locations;
- vehicles in available, reserved, sold, in-transit and customs-related canonical states where valid;
- realistic makes/models/years/colors/VINs and purchase values;
- vehicle specifications;
- a small number of real private vehicle-photo fixture files through the storage provider, not base64/database blobs.

VINs, references and tenant relations must satisfy all real constraints.

### 4. China offers and procurement

Create offers representing:

- available;
- partially reserved where supported;
- fully reserved;
- materialized/sold;
- expired.

Include different vehicles, suppliers, quantities, currencies, validity dates and prices. Build reservation quantities that never oversubscribe.

Create representative:

- vehicle requests;
- candidates accepted/rejected/pending;
- confirmed and cancelled purchases;
- orders/items/reservations;
- supplier relations.

Use the existing workflow/materialization authority where practical. If direct Prisma writes are necessary for historical snapshots, reproduce every invariant/history/side effect explicitly and explain why.

### 5. Dossiers

Create a balanced set of CIF, DDP and shipping-only dossiers at meaningful workflow points:

- initial/new;
- client confirmed;
- contract/document blocked;
- upfront-payment blocked;
- purchase confirmed;
- supplier paid;
- inspection/booking/loading/in-transit;
- arrived/customs;
- final-payment blocked;
- delivered/completed;
- cancelled with resources released.

Use only statuses valid for each dossier type. Every history must be chronologically valid. Ensure related client, offer, vehicle, order, purchase, assignees, shipment, customs and documents belong to the same organization.

Include deliberately blocked and ready-to-advance dossiers so gate banners/actions can be tested. Do not bypass gates merely to create later examples; construct the required evidence/payments for advanced dossiers.

### 6. Finance

Create financially reconcilable scenarios in DZD, USD, CNY and EUR:

- historical exchange rates covering the anchor date and prior months;
- draft, issued, partially paid, paid, overdue and void invoices;
- valid invoice items and totals;
- 30/70 plans with exact second-installment remainder;
- full-upfront plans;
- pending, confirmed, failed and reversed payments;
- allocations that never exceed payment/invoice/installment amounts;
- one legitimate overpayment represented as a customer deposit;
- confirmed and reversed supplier payments;
- purchase, shipping, customs, insurance, storage and operating costs;
- positive, zero and negative margin dossier examples created through valid business data.

Use Prisma Decimal or existing monetary helpers. Never use JavaScript floating-point arithmetic for business money. Serialize/report amounts consistently with the real API.

Seed data must prove:

- pending/failed/reversed money is excluded from collected revenue;
- historical conversion chooses the effective rate at or before the transaction;
- dossier, dashboard and report totals reconcile;
- costs are not double-counted.

### 7. Shipping and customs

Create shipments across canonical states such as booked, loading, departed, in-transit, arrived, customs and delivered where supported.

Include:

- containers, vessels, B/L numbers, ports, ETD/ETA and actual dates;
- one on-time shipment;
- one late active shipment;
- one completed shipment;
- customs files in documents-pending, inspection, duties-due, cleared/released and blocked states where valid;
- customs valuation/duty/tax/fees consistent with finance costs;
- immutable chronological histories.

This is persisted operational tracking, not fake external carrier integration.

### 8. Private documents

Create small valid fixture files for the supported domains:

- vehicle photo;
- business document;
- dossier document;
- proof;
- contract;
- customs document;
- payment receipt.

Create them through the real storage/document service or a seed adapter that uses the same validation, opaque-key, checksum and tenant-layout rules.

Requirements:

- actual bytes exist in the configured disposable/private storage root;
- DB size/checksum/MIME/storage metadata matches the files;
- no public URL or absolute path leaks through APIs;
- no dangling FileAsset row;
- no file is shared between tenants unless the model explicitly supports safe immutable deduplication without access leakage.

### 9. Tasks, notifications and audit

Create realistic persisted:

- open, due-soon, overdue, completed and cancelled tasks;
- personal and team assignments;
- tasks linked to leads, clients, dossiers, calls or appointments where valid;
- read and unread notifications with several categories/severities;
- deduplicated event-triggered notifications;
- append-only audit events for representative demo actions using safe/redacted summaries.

Do not fabricate audit secrets, raw passwords/tokens or file bodies.

### 10. Dashboard and reports

Do not seed dashboard/report result tables unless the real architecture intentionally materializes them. Seed authoritative transactional rows so dashboard and reports derive meaningful:

- dossier/status/type distributions;
- stock figures;
- invoices, collections, outstanding and overdue values;
- twelve-month revenue/cost/margin trend around the anchor date;
- CRM source/status/temperature/conversions;
- per-agent call statistics;
- active/late shipping/customs;
- tasks, callbacks and operational alerts.

## Recommended small-scale volume

Adjust only when schema/business constraints require it. A useful default target is approximately:

- 2 organizations;
- 8–10 primary users and 2 secondary users;
- 25–40 leads, 15–25 clients;
- 60–100 call/message/timeline events;
- 5–8 suppliers/carriers;
- 20–30 vehicles and 12–20 offers;
- 15–24 dossiers across three workflows;
- 15–25 invoices and associated payment plans/payments;
- 8–12 shipments/customs files;
- 20–35 tasks and notifications;
- representative documents in every category.

Prefer coherent quality over maximizing row counts.

## Idempotency and failure handling

- Running the demo seed twice must not increase logical counts or duplicate histories, payments, allocations, notifications, audit entries or files.
- Use deterministic idempotency keys and stable unique fields.
- Process each domain in a dependency-respecting order.
- Use transactions for each coherent aggregate.
- If a stage fails, report its domain and rollback that aggregate rather than leaving half-linked records.
- Do not silently ignore unique conflicts or validation failures.
- Do not delete all tenant data to achieve idempotency.

## Verification script

Implement a read-only verification command that fails nonzero when an invariant is broken. It must check at least:

- expected demo organizations/users and same-tenant relations;
- no cross-tenant foreign relations;
- no duplicate stable references/idempotency keys;
- valid workflow/status histories;
- offer/reservation/stock quantities;
- invoice/payment/allocation/deposit reconciliation;
- 30/70 and full-upfront plan correctness;
- dashboard/report financial totals against underlying rows;
- shipment/customs chronological consistency;
- every FileAsset has an existing matching file/checksum/size;
- every supported document category is represented;
- notification deduplication/read states;
- audit redaction constraints;
- required blocked and ready dossier examples exist.

Print a compact table of counts and invariant results, never sensitive values.

## Required validation

Use a brand-new disposable database and disposable storage directory:

1. deploy all migrations from zero;
2. run the existing deterministic base seed;
3. run the new demo seed;
4. run the demo seed a second time;
5. compare first/second logical counts and file inventory;
6. run the verification script;
7. run Prisma validate/generate/status/drift;
8. run affected backend tests, TypeScript, build and focused lint;
9. run affected frontend tests/type check/build if shared contracts or UI assumptions changed;
10. start backend/frontend and execute API plus real-browser smoke.

Browser smoke must confirm meaningful nonzero data on:

- Dashboard;
- CRM leads/clients and client timeline;
- Call Center simulator/KPIs;
- suppliers, vehicles and offers;
- dossier list, creation and representative detail tabs;
- finance/invoices;
- shipments/customs;
- documents download;
- tasks and notifications;
- reports and settings.

Log in with an administrator, operational user and restricted/read-only user. Verify the secondary tenant cannot see primary-tenant demo rows.

Clean up only the task-created disposable database/storage/processes. Do not delete the user's normal development database or files.

## Documentation

Add concise instructions explaining:

- required environment variables;
- exact command to seed demo data;
- exact verification command;
- demo users/roles without their password;
- scale/anchor-date behavior;
- production refusal behavior;
- how to use a dedicated disposable database/storage directory;
- which dashboards/workflows each scenario is intended to test.

## Completion criteria

Do not claim completion unless:

- production execution is impossible without changing code;
- the seed is deterministic and idempotent;
- two tenants and role variants exist;
- all major ERP modules have realistic relational data;
- money, stock, workflow and gate invariants pass;
- every document metadata row maps to real private fixture bytes;
- the verification command passes;
- the second seed run produces no logical duplicates;
- API and real-browser checks show the seeded data correctly;
- no existing user data was changed;
- no commit or push was made.

If a validation was not executed, report it as `NOT RUN` rather than passing it by assumption.

## Final response

Return:

1. **Seeder architecture** — files/scripts and production guards.
2. **Demo scenarios** — counts per organization/domain and login emails/roles without password.
3. **Invariant verification** — finance, stock, workflows, tenants and files.
4. **Validation matrix** — exact commands, exits and test counts.
5. **How to run** — exact base seed, demo seed and verify commands.
6. **Browser evidence** — routes/personas/scenarios tested.
7. **Remaining blockers** — concrete only, or `none`.

Do not repeat this prompt or report fabricated validation.
