# Codex ERP Phase 1 — Core Commerce, Dossiers and Procurement

## Objective

Implement and validate the remaining core vehicle-import transaction flow:

1. suppliers/partners;
2. vehicles, warehouses and stock movements;
3. China offers and reservations;
4. dossiers and their canonical workflows;
5. vehicle requests, candidates, orders, reservations and purchases.

This is an implementation task. Do not audit the whole repository and do not start finance, shipping, customs, documents, dashboard or reports.

## Current authoritative baseline

Repository:

```text
auto-import/
├── backend/                 NestJS 11 + Prisma + PostgreSQL
├── frontend/                Next.js 16.3 + React 19.2 App Router
├── shared/contracts/        canonical enums/statuses/permissions
└── docs/api-contract.md
```

Already complete and validated:

- canonical API envelope/errors/pagination, Swagger and shared contracts;
- Prisma migration consistency, tenant relations/indexes and deterministic seed;
- secure authentication, refresh sessions and frontend API client;
- tenant-safe RBAC, users, roles, permissions and offices;
- CRM and Call Center, including leads/clients/contact identity/timelines/tasks/appointments/notifications/audit minimum;
- 8 fresh migrations, 109 backend unit tests, backend E2E, 14 frontend tests and both production builds.

Do not reimplement or broadly retest the baseline before this phase.

## Efficiency rules

- Read repository instructions first if present.
- Inspect only the targeted modules/pages listed below.
- Use targeted `rg` only when a path moved or a concrete import/relation requires it.
- Do not read unrelated finance/shipping/document/report mocks.
- Reuse the existing API client, DTO patterns, permissions, UI components and test setup.
- Keep French UI labels; API/domain values remain canonical English camelCase/shared values.
- Run targeted tests while coding and one full phase validation at the end.
- Changed production files must lint clean; do not fix unrelated legacy global-lint debt.
- Use additive data-safe migrations and never reset/drop an unknown database.
- Preserve unrelated changes and do not commit unless requested.

## Targeted files

Backend initial reads:

```text
backend/prisma/schema.prisma
backend/src/app.module.ts
backend/src/partners/**
backend/src/vehicles/**
backend/src/warehouses/**
backend/src/dossiers/**
backend/src/vehicle-requests/**
backend/src/orders/**
```

Read current Foundation/CRM code only for an exact established pattern such as CurrentUser, permission naming, event/audit emission, response DTO selection or API testing.

Frontend initial reads:

```text
frontend/lib/api.ts
frontend/lib/api-contract.ts
frontend/app/(dashboard)/fournisseurs/page.tsx
frontend/app/(dashboard)/vehicules/page.tsx
frontend/app/(dashboard)/offres/page.tsx
frontend/app/(dashboard)/offres/[id]/page.tsx
frontend/app/(dashboard)/dossiers/page.tsx
frontend/app/(dashboard)/dossiers/creer/page.tsx
frontend/app/(dashboard)/dossiers/[id]/page.tsx
```

Read only directly imported supplier/vehicle/offer/dossier forms and tabs, plus the matching sections/types in `frontend/lib/mockData.ts` and `frontend/types/index.ts`.

## Intended backend ownership

```text
backend/src/
├── partners/                    complete existing module
├── vehicles/                    complete existing module
├── warehouses/                  complete existing module
├── offers/                      new ChinaOffer/reservation domain
├── dossiers/                    complete aggregate/workflow
├── vehicle-requests/            complete request/candidate lifecycle
├── orders/                      complete order/reservation lifecycle
└── purchases/                   separate only if current architecture benefits
```

Do not move working modules merely to match this tree.

## Suppliers/partners

Complete tenant-safe Partner/Supplier behavior and frontend integration:

- canonical partner type and active/archived status;
- contacts, address/country, website, payment/delivery terms, specialties and notes required by the existing UI;
- search, type, status, country and pagination;
- `partners:read/write` permissions;
- real tenant-safe relations from vehicles/offers/purchases;
- efficient relation counts/summaries;
- archive referenced suppliers instead of destructive deletion;
- `/fournisseurs` list/detail/create/edit using real APIs with loading, empty, validation, conflict, forbidden and retry states;
- zero supplier mock imports after completion.

## Vehicles, warehouses and stock

- Finalize canonical vehicle statuses and acquisition/source types with French label maps.
- Complete list/detail/create/update/archive, search, status, source, supplier, location and VIN filters.
- Validate tenant ownership of supplier and current warehouse/location.
- Keep VIN unique. Missing VIN is allowed only in explicit pre-purchase states.
- Complete VehicleSpec APIs and frontend display/forms.
- Complete warehouse/location CRUD with organization from auth only.
- Implement stock movements transactionally with actor, date, source, destination, reason and history.
- Keep Vehicle.currentLocation and movement history consistent in one transaction.
- Fix static/dynamic route conflicts if any remain.
- Produce canonical stock summaries.
- Integrate `/vehicules` with real data. Do not store photo data URLs; actual uploads belong to Phase 2.

## China offers

Implement `ChinaOffer` as a supplier catalog listing—not as a Vehicle, VehicleRequest, Order or Purchase.

Required data:

- organization and supplier;
- vehicle description/specification snapshot;
- condition;
- purchase, CIF and DDP prices;
- currency: DZD, USD, CNY or EUR;
- validity start/end;
- available/reserved quantity;
- estimated delay;
- status behavior derived from dates and quantities;
- explicit client interest/reservation relation;
- optional resulting dossier relation through the reservation.

Required behavior:

- tenant-scoped CRUD/list/detail/statistics;
- search/supplier/status/condition/validity filters;
- transactional reservation and release;
- concurrency protection against oversubscription;
- expiration cannot be bypassed by manually setting an active status;
- cancelling a linked dossier releases quantity;
- selecting an offer does not create a fake zero-cost/empty-VIN Vehicle;
- materialize a Vehicle only when purchase/VIN data becomes authoritative;
- canonical `offers:read/write` permissions;
- database-backed KPIs on `/offres`;
- fix both offer-to-dossier links to `/dossiers/creer` using one canonical query parameter.

## Dossiers

Preserve canonical types and initial states:

- `VEHICLE_SALE_CIF` → `offerSelected`;
- `VEHICLE_SALE_DDP` → `offerSelected`;
- `SHIPPING_ONLY` → `clientRegistered`.

Requirements:

- one workflow service is the only normal transition authority;
- no caller-controlled initial status;
- store normalized canonical statuses only;
- no candidate/purchase service may force an invalid transition, especially for shipping-only;
- allowed-transition/status/history APIs include actor, timestamp and comment;
- cancellation releases offer and vehicle reservations transactionally;
- closure marks a vehicle sold only when appropriate;
- validate client, offer reservation, request, order, vehicle and team organization/consistency;
- implement safe editable fields and sales/operations assignment;
- replace count-based dossier references with concurrency-safe human-readable references;
- correct statistics to canonical status buckets;
- expose a typed aggregate response containing real implemented relations and honest empty sections for Phase 2 finance/shipping/documents;
- retain backend extension points for payment/document/proof gates without pretending they passed.

Integrate:

- `/dossiers` list, filters and statistics;
- `/dossiers/creer` wizard for existing/new client, China offer or external request, vehicles and team;
- `/dossiers/[id]` overview, relations, team edit, workflow advancement and history;
- no dossier mock fallback or fabricated nested finance/shipping data.

## Requests, orders, reservations and purchases

- Define/enforce canonical state machines.
- Use typed DTOs; purchase confirmation must never accept `any`.
- Verify candidate belongs to the request, tenant and expected vehicle.
- Validate consistency among client, dossier, offer, request, order, vehicle and supplier.
- Route dossier transitions through the workflow service.
- Make purchase confirmation transactional and idempotent.
- A retry must not duplicate Purchase, Vehicle, Order, Reservation or history.
- Decide when the offer/request becomes an actual Vehicle and preserve supplier/price/spec snapshots.
- Complete order update/cancellation/status/history behavior.
- Implement reservation expiration/release; avoid unsafe physical deletion.
- Expose procurement views through dossier tabs and add standalone pages only when current navigation requires them.
- Use dedicated `vehicleRequests:*`, `orders:*` and `purchases:*` permissions.

## Required tests

Add targeted tests for:

1. supplier CRUD/archive and tenant relations;
2. VIN uniqueness and vehicle/location validation;
3. transactional stock movements;
4. offer expiration, reservation, concurrent reservation and cancellation release;
5. offer → dossier wizard payload/navigation;
6. all three dossier initial states/workflows and invalid jumps;
7. shipping-only rejection of purchase-only states;
8. cancellation releasing every reservation;
9. reference uniqueness under concurrency;
10. candidate/request consistency and cross-tenant attempts;
11. idempotent purchase confirmation;
12. order/reservation cancellation and history;
13. frontend API loading/error/forms and persistence;
14. a browser smoke from supplier/offer/client through persisted dossier/purchase.

## Phase validation

At the end run once:

- Prisma validate/generate and all migrations on a fresh disposable database;
- schema drift check;
- backend tests relevant to partners/vehicles/warehouses/offers/dossiers/procurement/orders;
- relevant security/E2E tests;
- relevant frontend tests;
- backend/frontend TypeScript checks;
- both production builds;
- changed-production-file lint;
- `git diff --check`;
- one real-data browser smoke.

## Completion bar and stop

Before stopping:

- supplier, vehicle, offer and dossier pages use real APIs;
- procurement/order/purchase flows persist and remain tenant-safe;
- offer/vehicle reservations are concurrency-safe and released correctly;
- all dossier workflows are valid;
- no Phase 1 production route consumes corresponding mocks;
- migrations, targeted tests, type checks and builds pass.

Do not begin Phase 2 finance/shipping/documents.

Stop early only for an ambiguous data migration that could corrupt ownership. Return one concise report with models/migrations, APIs, frontend routes, removed mocks, validation results and exact blockers.
