# Auto‑Import ERP — Codex Implementation Prompt Pack

These prompts convert the repository audit into an implementation sequence. Give Codex **one prompt at a time**, in the order shown. Do not paste all prompts in one request. After each phase, review Codex's completion report and ensure its validations pass before starting the next phase.

The prompts are intentionally implementation-focused. Each one tells Codex to inspect the current repository state first because earlier phases may change files and contracts.

## Global project context

- Repository contains `frontend/` and `backend/`.
- Frontend: Next.js 16.3, React 19.2, App Router.
- Backend: NestJS 11, Prisma, PostgreSQL, global `/api` prefix.
- Backend successful responses use an envelope similar to `{ success, data, timestamp, path, statusCode }`.
- The product is a multi-tenant ERP/CRM for an Algerian vehicle-import business.
- The central aggregate is the dossier. Supported types are CIF vehicle sale, DDP vehicle sale, and shipping-only.
- API fields should be English `camelCase`; French wording should remain a presentation concern in the UI.
- The current frontend is powered by `frontend/lib/mockData.ts` and has no real API integration.
- Preserve the existing visual design and French user-facing labels unless a change is required for correctness.

---

## Prompt 1 — Establish the canonical API and domain contracts

```text
You are working in the Auto-Import ERP repository. Implement the canonical contracts that the rest of the integration will use. This is an implementation task, not another audit.

Goal:
Create one authoritative contract for API responses, errors, pagination, field names, enums/statuses, and permissions across the NestJS backend and Next.js frontend. API/domain code must use English camelCase. The UI may keep French labels through presentation mappings.

Required work:
1. Read repository instructions such as AGENTS.md and inspect the current backend DTOs, workflow constants, response interceptor, exception filter, Prisma schema, frontend types, and permission checks.
2. Define canonical constants/types for:
   - the three dossier types: VEHICLE_SALE_CIF, VEHICLE_SALE_DDP, SHIPPING_ONLY;
   - every canonical dossier workflow status;
   - vehicle, order, prospect, offer, payment, shipment, and customs statuses that already exist or are immediately required;
   - permission resources/actions using one vocabulary such as `dossiers:read` and `dossiers:write`.
3. Eliminate duplicate or obsolete status definitions where safe. Add explicit frontend label maps rather than using French values as API values.
4. Standardize list responses and pagination metadata. Keep the global success envelope consistent and document the exact error format.
5. Add Swagger/OpenAPI configuration for backend DTOs and auth. Ensure it accurately describes the implemented API rather than inventing future endpoints.
6. Create/update a short contract document in the repository and add `.env.example` files for backend and frontend without secrets.
7. Add targeted contract tests for response envelopes, errors, pagination, enum rejection, and permission constants.

Constraints:
- Preserve backward compatibility only where it does not perpetuate unsafe or ambiguous behavior.
- Do not implement unrelated business modules in this phase.
- Do not introduce new mocks or TODO-only placeholders.
- Preserve unrelated user changes and do not commit unless explicitly requested.

Success criteria:
- Backend and frontend compile against the same canonical concepts.
- Obsolete dossier statistics/status constants are no longer treated as authoritative.
- OpenAPI generation works.
- Contract tests pass.

Validation:
Run relevant backend tests, type checks, Prisma validation, frontend type checking, and non-writing lint checks. Fix failures caused by this phase. If a pre-existing failure remains, demonstrate that it is pre-existing and report it precisely.

Stop after completing this phase. Return: changes made, contract decisions, migrations if any, commands/results, and remaining blockers. Do not begin authentication integration.
```

---

## Prompt 2 — Reconcile Prisma schema, migrations, indexes, and tenant relations

```text
Continue implementing the Auto-Import ERP. Reconcile the Prisma schema and migration history so a fresh database and an upgraded existing database produce the same supported structure.

Goal:
Make PostgreSQL/Prisma a reliable foundation before further API integration.

Required work:
1. Inspect the current schema, all migrations, seed, `add-unique-constraint.js`, database configuration, and git status.
2. Start or connect to the repository's intended development PostgreSQL instance using existing project tooling. Do not assume the previous localhost port is still correct.
3. Resolve migration/schema drift without using destructive reset commands against unknown data.
4. Move the VehicleCandidate `(vehicleRequestId, vehicleId)` uniqueness rule into an actual migration and remove dependence on the manual script.
5. Represent required organization indexes in both the schema and migrations. Add useful indexes for tenant-scoped lists, status filters, references, dates, and foreign keys based on actual query patterns.
6. Replace important string pseudo-relations with real Prisma relations where the referenced entity is known and doing so is safe, especially organization-sensitive references. Plan additive/backfilled migrations for existing rows.
7. Ensure operational models can be scoped safely to an organization either directly or through a mandatory tenant-owned parent. Do not leave a model globally queryable merely because its service is not implemented yet.
8. Make the seed deterministic and explicitly development/test-only. It must not silently attach data to an arbitrary first organization.
9. Add migration tests or a repeatable verification script that checks both a fresh migration and Prisma validation.

Constraints:
- Never drop/reset production-like data or rewrite applied migration history blindly.
- Prefer additive migrations with explicit backfills and constraints.
- If an existing database contains ambiguous orphaned records, stop only for that concrete data decision and report exact affected rows/fields.
- Do not implement frontend features in this phase.

Success criteria:
- `prisma validate` passes.
- Migration status is determinable against a running development database.
- A fresh database can be created solely from migrations.
- Schema and migration structures match, including indexes and unique constraints.

Validation:
Run Prisma validation/generation, migration deployment against a disposable development/test database, backend type checking, and relevant tests.

Stop after this phase and report migrations created, data-safety decisions, validation results, and remaining schema risks.
```

---

## Prompt 3 — Implement secure authentication and the frontend API foundation

```text
Implement real end-to-end authentication and the reusable frontend API layer for the Auto-Import ERP.

Goal:
Replace the mock AuthProvider behavior with secure login, session restoration, current-user loading, refresh, logout, authenticated requests, and protected routes.

Required work:
1. Inspect current auth services, JWT strategies/guards, CORS configuration, response envelope, frontend AuthProvider, route groups, and current UI patterns.
2. Implement a real French login page with loading, invalid-credential, inactive-account, and network-error states.
3. Create a typed frontend HTTP client using the configured API base URL. It must:
   - unwrap the canonical response envelope;
   - normalize backend errors;
   - attach the access token;
   - perform a single-flight refresh on eligible 401 responses;
   - retry the original request once;
   - avoid refresh loops.
4. Use a secure refresh-session design. Prefer an HttpOnly, Secure-in-production, SameSite cookie backed by revocable/rotatable server-side refresh sessions or hashed refresh tokens. Do not persist refresh tokens in localStorage.
5. Make login and refresh check both user and organization status.
6. Implement `GET /api/auth/me` as the canonical current-user endpoint. Keep a temporary POST alias only if needed for compatibility and mark it for removal in documentation.
7. Make logout revoke the refresh session and clear its cookie.
8. Replace mock user switching with the authenticated user. Protect dashboard routes on both initial navigation and client-side transitions. Redirect unauthenticated users to login and unauthorized users to a proper 403 page.
9. Configure explicit allowed origins when credentials are enabled; do not combine wildcard CORS with credentials.
10. Add backend auth tests and frontend tests for login, bootstrap, refresh, logout, route protection, and failure behavior.

Constraints:
- Preserve the existing dashboard UI after login.
- Never log passwords or tokens.
- Do not implement domain API integrations beyond auth/current user in this phase.
- Do not use a mock fallback when the backend is unavailable.

Success criteria:
- A real seeded user can log in, refresh the browser, remain authenticated, call `/auth/me`, and log out.
- Disabled users or inactive organizations cannot log in or refresh.
- A revoked refresh session cannot be reused.
- Direct unauthenticated navigation to dashboard routes is blocked.

Validation:
Run targeted backend/frontend tests, type checks, lints, and an end-to-end auth smoke test against a real development database.

Stop after authentication is working. Report security choices, modified endpoints, tests/results, and any deployment cookie requirements.
```

---

## Prompt 4 — Fix RBAC and tenant-isolation vulnerabilities

```text
Harden RBAC and multi-tenant isolation in the Auto-Import ERP. Implement the fixes and adversarial tests; do not merely list the findings.

Goal:
Guarantee that an authenticated user cannot read, create, link, reassign, or mutate another organization's records and that controllers use the canonical permission vocabulary.

Known issues to resolve:
- Warehouse creation/update accepts or prefers a body `organizationId`.
- Stock-movement listing is globally queryable and creation does not validate source/destination ownership.
- Vehicle `supplierId` and `currentLocationId` are unvalidated strings.
- User `officeId` is not tenant-validated.
- Organization users can receive inappropriate platform/global roles.
- Vehicle-request purchase confirmation can accept a candidate that does not belong to the request.
- Refresh behavior previously failed to validate organization status.
- Prospects use client permissions, partners use vehicle permissions, and vehicle requests use mixed unrelated permissions.
- User/role read/write/manage permissions are inconsistent.

Required work:
1. Derive organization identity only from the authenticated principal for ordinary tenant operations. Remove organization selection from unsafe request DTOs.
2. Add tenant-safe relation checks in services and transactions before creating or updating references.
3. Ensure every list/detail/update/delete path is tenant-scoped, including indirect operational and financial records.
4. Enforce role scope and prevent tenant administrators from assigning platform roles or privileges they do not possess.
5. Use the canonical resource permissions consistently in controllers and seed data. Add missing permission resources needed by existing modules.
6. Ensure authorization failures do not reveal whether another tenant's ID exists.
7. Add adversarial tests for cross-tenant IDs in bodies, path params, queries, nested relations, role IDs, office IDs, warehouse locations, candidates, and stock movements.
8. Review transaction boundaries to prevent time-of-check/time-of-use relationship changes.

Constraints:
- Do not rely on frontend filtering for security.
- Do not accept caller-supplied organization IDs unless the endpoint is explicitly platform-admin-only and tested.
- Preserve legitimate platform-level roles and document their boundaries.

Success criteria:
- All confirmed audit vulnerabilities have regression tests and are fixed.
- Permission names correspond to their actual domain.
- Cross-tenant attempts fail without leaking data.

Validation:
Run the entire backend security/RBAC suite, type checking, Prisma validation, and targeted HTTP/E2E tests.

Stop after the security phase. Return a finding-to-fix mapping, tests/results, and any risks deferred because their domain is not implemented yet.
```

---

## Prompt 5 — Integrate users, roles, permissions, and offices

```text
Implement the complete users/roles/permissions/offices domain and connect the `/utilisateurs` frontend to the real backend.

Goal:
Remove user/role/permission mock dependencies while preserving the current French management interface.

Required work:
1. Inspect current users/roles services, DTOs, seed, permission guard, frontend user/role types and modals.
2. Add a tenant-safe Office service/controller and required CRUD or lookup endpoints.
3. Make user list/detail DTOs explicit. Never serialize `passwordHash` or other credential fields.
4. Support search, status, role, office, and pagination filters required by the UI.
5. Implement user creation/update, activation/deactivation, password setting/reset by an authorized administrator, and multi-role assignment.
6. Validate email uniqueness and all office/role relationships within the permitted organization/scope.
7. Implement role CRUD with permission IDs, privilege-escalation protection, and clear handling of global versus organization roles.
8. Replace frontend mock reads/mutations with typed API modules and real loading, empty, validation, conflict, forbidden, and retry states.
9. Drive sidebar and control visibility from the authenticated user's real permissions, while keeping backend enforcement authoritative.
10. Add backend and frontend tests for all important flows and sensitive-field absence.

Constraints:
- Keep API fields English camelCase and UI labels French.
- Do not silently generate or display plaintext passwords. Use a deliberate initial-password or secure reset workflow.
- Do not keep a mock user fallback.

Success criteria:
- `/utilisateurs` works after reload with database data.
- User and role changes persist.
- Unauthorized actions are hidden where helpful and always rejected by the backend.
- API responses contain no password hashes.

Validation:
Run targeted tests, type checks, lints, and a browser smoke test of user/role/office CRUD using at least two permission levels.

Stop after this domain is fully integrated and report changed contracts, tests/results, and remaining UX limitations.
```

---

## Prompt 6 — Complete CRM prospects, activities, conversion, and clients

```text
Implement and integrate the CRM foundation: prospects/leads, activities, conversion, clients, and client aggregates.

Goal:
Replace mock data on `/crm/leads`, `/crm/clients`, `/crm/clients/[id]`, and the legacy `/clients` route with tenant-scoped backend data.

Required work:
1. Reconcile the richer frontend lead pipeline with the backend Prospect model. Define canonical English statuses and a French label/order map. Migrate existing compatible data safely.
2. Use dedicated `prospects:*` permissions instead of `clients:*` for prospect operations.
3. Implement prospect list/detail/create/update/delete with search, status, assignee, source, date, and pagination filters.
4. Replace string agent references with tenant-safe User relations where feasible.
5. Implement activities with type, title, description, date, author, and prospect relation. Remove redundant caller-controlled `prospectId` when it is already in the route.
6. Implement advance, lost, won/conversion behavior with validated transitions and an auditable activity entry.
7. Complete client creation in addition to prospect conversion. Support client update, detail, dossiers/orders, and the aggregate fields needed by the UI, calculated from authoritative relations rather than stored mock totals.
8. Resolve or intentionally retire the duplicate legacy `/clients` screen so there is one coherent client experience.
9. Add prospect statistics and client summary endpoints required by the UI; avoid hardcoded KPIs.
10. Replace frontend mock mutations with API calls, proper forms, loading/errors, cache updates/revalidation, and persistence across refresh.
11. Add backend and frontend tests for conversion idempotency, duplicate contacts, permissions, tenant isolation, filters, and aggregate calculations.

Constraints:
- Do not implement phone recording, WhatsApp, email delivery, or general tasks yet.
- Do not precompute monetary client totals without a reliable finance source; return clearly defined current values or zero until finance is integrated.
- Preserve the current visual pipeline and French labels.

Success criteria:
- Leads and clients are database-backed end to end.
- Conversion creates exactly one linked client and cannot duplicate on retry.
- Activities and status changes persist and show the responsible user.

Validation:
Run backend/frontend tests, type checks, lints, and browser smoke tests for create → activity → status change → conversion → client detail.

Stop after CRM/client integration and report the canonical pipeline and validation results.
```

---

## Prompt 7 — Complete partners and suppliers

```text
Complete the Partner/Supplier domain and integrate `/fournisseurs` with the backend.

Goal:
Represent real suppliers and other partners with the fields and relations required by vehicle sourcing, China offers, purchases, shipping, and dossier views.

Required work:
1. Inspect Partner schema/service/DTOs and the richer frontend supplier type/forms.
2. Define canonical partner types and statuses. Add required supplier fields such as website, contact details, address/country, payment/delivery terms, specialties, notes, and active state only when supported by actual UI/business needs.
3. Replace unenforced supplier string references with tenant-safe Partner relations where appropriate.
4. Implement tenant-scoped list/detail/create/update/archive or delete with search, type, status, country, and pagination.
5. Use `partners:read/write` permissions, not vehicle permissions.
6. Expose supplier relation counts and vehicle/offer/purchase summaries through efficient database queries rather than mock calculations.
7. Connect supplier forms/details/list to typed API calls with loading, errors, validation, empty states, and refresh persistence.
8. Add tests for duplicate/invalid data, tenant isolation, referenced-partner deletion behavior, permissions, and list filters.

Constraints:
- Do not physically delete a supplier referenced by operational records; archive it or return a conflict.
- Do not implement offers/purchases themselves in this phase.
- Preserve the current French UI.

Success criteria:
- Supplier CRUD persists in PostgreSQL.
- Supplier references are validated and tenant-safe.
- `/fournisseurs` no longer imports supplier mock arrays.

Validation:
Run relevant tests, type checks, lints, Prisma validation, and a frontend CRUD smoke test.

Stop after partners/suppliers are complete and report schema/API changes and validation results.
```

---

## Prompt 8 — Complete vehicles, warehouses, locations, and stock movements

```text
Implement the full vehicle inventory and warehouse workflow and connect it to the frontend.

Goal:
Make vehicles, specifications, warehouse locations, reservations, and stock movements authoritative and tenant-safe.

Required work:
1. Inspect vehicle/warehouse services, DTOs, routes, schemas, frontend vehicle cards/forms, and current navigation.
2. Finalize canonical vehicle statuses and acquisition/source types. Provide French UI labels without using French values in API payloads.
3. Implement vehicle list/detail/create/update/archive with search, status, acquisition type/source, supplier, warehouse/location, VIN, and pagination.
4. Validate VIN uniqueness and tenant ownership of suppliers and locations. Support vehicles without VIN only when the business lifecycle genuinely allows it, using a clear rule.
5. Integrate vehicle specifications through explicit endpoints/types.
6. Complete warehouse and location CRUD with organization derived from auth. Fix static/dynamic route ordering so `/stock-movements` cannot be captured as an ID.
7. Implement stock movements transactionally, including source/destination validation, movement history, actor, date, reason, and resulting current location.
8. Expose stock summaries based on canonical statuses.
9. Add or expose the necessary frontend warehouse/stock interface if no page exists. Integrate `/vehicules`; photos may use a temporary empty state until the file-storage phase, but never data URLs persisted as production files.
10. Add tests for concurrent VIN creation, movement consistency, cross-tenant references, reservations, filtering, and route correctness.

Constraints:
- Do not store uploaded photo bytes as base64/data URLs in database records.
- Do not let stock movements and vehicle current location diverge.
- Do not implement China offers in this phase.

Success criteria:
- Vehicle and stock operations survive reload and use real data.
- Warehouse/location relationships are tenant-safe.
- Stock summary values match database state.

Validation:
Run backend/frontend tests, type checks, lints, Prisma validation, and an end-to-end vehicle creation and movement smoke test.

Stop after this inventory phase and report any photo functionality intentionally deferred to the file-storage phase.
```

---

## Prompt 9 — Implement the real “Offres Chine” domain

```text
Implement “Offres Chine” as a real backend/database domain and integrate `/offres` and `/offres/[id]`.

Goal:
Replace the frontend-only Offre mock entity with a persisted supplier catalog offer that can safely feed dossier creation and later procurement.

Domain direction:
- Treat a China offer as a supplier catalog listing, not as an already-owned Vehicle.
- It should contain supplier, vehicle description/specification snapshot, purchase/CIF/DDP prices, currency, validity window, available quantity, estimated delay, status, and organization.
- Model client interest/reservation explicitly instead of storing an uncontrolled array of client IDs.
- A dossier may reference an offer reservation. The physical Vehicle should be created/materialized later when purchase/VIN information becomes authoritative, not merely when somebody views or selects an offer.

Required work:
1. Design Prisma models/relations and an additive migration for ChinaOffer and any OfferReservation/Interest relation required by the flow.
2. Implement tenant-scoped CRUD/list/detail/statistics with search, supplier, status, condition, validity, and pagination filters.
3. Define active/expired/available/reserved/sold status behavior from dates and quantities. Do not rely on a user manually marking an expired offer active.
4. Implement transactional reservation/release rules. Prevent oversubscription under concurrent requests.
5. Link the offer/reservation to client and dossier consistently without creating a fake zero-cost vehicle.
6. Integrate offer list/detail/create/edit forms with real APIs and database-backed KPIs.
7. Fix offer-to-dossier navigation so both list and detail use the existing `/dossiers/creer` route and one canonical query parameter.
8. Make the dossier wizard load and validate the selected offer from the backend.
9. Add permissions such as `offers:read/write` and tenant/security tests.
10. Add tests for expiration, quantity reservation, concurrent reservation, cancellation release, supplier ownership, and dossier linkage.

Constraints:
- Do not represent an offer as a VehicleRequest, VehicleCandidate, Order, or Purchase merely to avoid adding the correct domain.
- Do not generate a Vehicle with empty VIN, empty supplier, or zero purchase cost during offer selection.
- Keep frontend labels and existing design.

Success criteria:
- Offer CRUD and KPIs are database-backed.
- Selecting an offer can begin dossier creation reliably.
- Reservation quantities and cancellation remain consistent.

Validation:
Run migrations, Prisma validation, targeted backend/frontend tests, type checks, lints, and an offer → dossier-wizard smoke test.

Stop after the offer domain is integrated. Report the final model and reservation semantics.
```

---

## Prompt 10 — Complete and integrate the dossier aggregate and workflows

```text
Make the dossier the reliable central aggregate of the Auto-Import ERP and replace dossier mock behavior end to end.

Goal:
Integrate `/dossiers`, `/dossiers/creer`, and `/dossiers/[id]` with the backend while fixing workflow bypasses, lifecycle consistency, references, and aggregate contracts.

Required work:
1. Preserve the canonical CIF, DDP, and shipping-only sequences. Use one workflow service as the only normal authority for transitions.
2. Remove caller-controlled initial status from ordinary dossier creation. Always use the canonical initial state.
3. Normalize and store canonical statuses only. Prevent vehicle-request/candidate/purchase code from forcing invalid transitions such as `achat_confirme`, especially for shipping-only dossiers.
4. Implement allowed-transition and advance/status APIs with comments, actor, timestamp, and history.
5. Implement cancellation and reopening rules if supported. Cancellation must release relevant offer reservations and vehicle reservations transactionally. Closing should mark vehicles sold only when appropriate for the dossier type and actual order state.
6. Replace count-based reference generation with a concurrency-safe human-readable approach backed by a database constraint/sequence or robust retry.
7. Validate that client, offer reservation, vehicle request, order, vehicles, and assigned sales/operations users all belong to the same organization and represent a consistent dossier.
8. Implement general dossier editing for allowed fields and team assignment with explicit DTOs.
9. Build a typed aggregate detail response. Include relations already implemented and return honest empty sections for domains scheduled later; do not fabricate mock finance/shipping/documents.
10. Integrate list, filters, statistics, creation wizard, detail overview, vehicle relations, team editing, and status advancement with real APIs.
11. Fix dossier statistics to use canonical statuses.
12. Add tests for all three workflows, invalid jumps, shipping-only behavior, cancellation release, concurrency, tenant consistency, reference uniqueness, and frontend wizard payloads.

Constraints:
- Do not bypass backend gates because the frontend normally hides a button.
- Do not keep a fallback to `mockData.ts`.
- Proof/payment/document gates may be represented as explicit pending capabilities, but transitions that already require them must not pretend they were validated.

Success criteria:
- A real client and offer/external request can create a persisted dossier.
- Status history and reservations remain consistent through advance/cancel/close.
- Dossier list/detail/statistics survive reload and contain no fake nested data.

Validation:
Run full dossier/security tests, frontend tests, type checks, lints, migrations if changed, and smoke tests for all three dossier types.

Stop after the dossier core is integrated. Report which tabs are complete versus waiting for later domain prompts.
```

---

## Prompt 11 — Complete vehicle requests, candidates, orders, reservations, and purchases

```text
Complete the procurement and sales-order lifecycle and connect it to dossiers and suitable frontend screens.

Goal:
Provide a coherent, transactional path from a client's vehicle request or China-offer reservation through candidate selection, order/reservation, purchase confirmation, and vehicle materialization.

Required work:
1. Inspect VehicleRequest, VehicleCandidate, Order, OrderItem, Reservation, Purchase, Dossier, and existing frontend dossier/purchase components.
2. Define and enforce canonical lifecycles and allowed transitions for requests, candidates, orders, reservations, and purchases.
3. Correct controller DTO usage, including using a typed ConfirmPurchaseDto instead of `any`.
4. Ensure candidate validation and purchase confirmation verify the candidate belongs to the request and tenant.
5. Prevent services from directly forcing invalid dossier states; request dossier transitions through the canonical dossier workflow/gate service.
6. Enforce consistency among dossier, client, request, offer reservation, order, vehicles, supplier, and organization.
7. Implement idempotent purchase confirmation in a transaction. A retry must not create duplicate purchases, vehicles, reservations, or history.
8. Decide and implement when a catalog offer becomes an actual vehicle record. Preserve the supplier/pricing/specification snapshot and allow VIN completion later if the business process requires it.
9. Complete reservation expiration/release behavior and order update/cancellation rules. Avoid unsafe physical deletion of financially or operationally referenced orders.
10. Expose list/detail/history endpoints needed by operations. Add frontend views or integrate them into dossier tabs/navigation while preserving the design language.
11. Add dedicated `vehicle-requests:*`, `orders:*`, and `purchases:*` permissions.
12. Add tests for concurrency, idempotency, cross-tenant candidate IDs, cancellation/release, invalid transitions, and dossier linkage.

Constraints:
- Do not implement customer/supplier money movement in this phase beyond preserving required monetary snapshots and references.
- Never delete audit/history records to make a retry succeed.
- No mock fallback.

Success criteria:
- A request can receive candidates, validate one, create/associate an order, confirm a purchase, and update the dossier through valid transitions.
- All operations are tenant-safe, transactional, and idempotent.

Validation:
Run procurement, order, dossier, and security tests plus frontend type/tests and an end-to-end procurement smoke test.

Stop after procurement/order integration and report the exact state machines and transaction boundaries.
```

---

## Prompt 12 — Implement finance, invoices, payments, 30/70 and 100% rules, costs, and currencies

```text
Implement the operational finance domain for the Auto-Import ERP and replace mock invoicing/dossier finance data.

Goal:
Create reliable invoicing, customer payment plans, installments, deposits/payments, supplier payments, costs, exchange rates, reconciliation, and margin calculations.

Business rules:
- Support a 30%/70% customer plan and a 100%-upfront plan.
- The due trigger for each installment must be represented explicitly, including the business event corresponding to vehicle recovery when applicable.
- Required confirmed payments must be enforced by backend dossier gates, not only by frontend messaging.
- Supported currencies include DZD, USD, CNY, and EUR.

Required work:
1. Inspect existing Invoice, InvoiceItem, PaymentPlan, PaymentInstallment, Payment, CustomerDeposit, SupplierPayment, ShippingCost, Order, Purchase, and dossier monetary fields.
2. Design additive schema changes for explicit plan strategy, installment percentage/amount, due trigger/date, allocation, receipt/reference, confirmed status, currency, and organization scoping.
3. Add general cost/expense records and exchange-rate records with source, effective date, direction/base currency, and immutable historical values used by transactions.
4. Implement finance services/controllers for invoice CRUD/issuance, payment-plan creation, installment generation, payment recording/confirmation/reversal, allocations, deposits, supplier payments, costs, and reconciliation.
5. Make payment recording idempotent using a stable reference/idempotency key. Never count pending, failed, or reversed payments as collected.
6. Calculate invoice/payment statuses from allocations. Define rounding rules and avoid floating-point money arithmetic; use Prisma Decimal or integer minor units consistently.
7. Calculate dossier revenue, costs, paid balance, outstanding balance, and margin from authoritative records with explicit currency conversion. Never add different currencies directly.
8. Enforce 30/70 or 100% prerequisites through the dossier workflow service. Return a precise blocked-transition error showing the missing confirmed amount/installment.
9. Implement finance permissions and audit-relevant actor metadata.
10. Integrate `/facturation` and dossier Finance/Purchase tabs with forms, list/detail, payments, costs, balances, and clear multi-currency display.
11. Add tests for plan generation, partial/overpayment, retries, reversal, failed/pending exclusion, rounding, exchange rates, gates, tenant isolation, and margin calculations.

Constraints:
- Do not process real bank/card payments or contact external payment providers in this phase.
- Do not mutate historical exchange rates used by posted transactions.
- Do not use mock conversion rates.

Success criteria:
- Invoices and payments persist and reconcile correctly.
- Both payment strategies are supported and enforced.
- Finance KPIs can later be derived without fake arrays.

Validation:
Run migrations on a disposable database, Prisma validation, finance/dossier/security tests, frontend tests/type checks/lints, and smoke tests for 30/70 and 100% flows.

Stop after operational finance is complete. Report accounting assumptions, rounding rules, gates, and test results.
```

---

## Prompt 13 — Implement shipping and customs operations

```text
Implement shipping/container and customs operations and integrate them with dossiers, vehicles, purchases, and the frontend.

Goal:
Replace the mock `/expeditions` data and provide authoritative shipment and customs tracking.

Required work:
1. Inspect Shipment, ShipmentVehicle, ShippingCost, CustomsFile, CustomsDocument, Partner, Vehicle, Order, Purchase, and dossier structures.
2. Finalize canonical shipment/container and customs statuses with validated transitions and French UI labels.
3. Make all records directly or safely indirectly tenant-scoped using real relations, not uncontrolled string IDs.
4. Implement shipment CRUD/list/detail, carrier linkage, container/tracking references, origin/destination, ETD/ETA/actual dates, vehicles, orders, costs, and status history.
5. Implement customs file CRUD/list/detail, shipment/vehicle linkage, reference, broker/partner if applicable, duties/fees, statuses, and history.
6. Add transactional assignment/removal of vehicles to shipments with rules preventing conflicting active shipments.
7. Connect shipment/customs transitions to vehicle and dossier state through explicit domain services without bypassing the dossier workflow.
8. Integrate `/expeditions` and relevant dossier tabs. Add customs UI/routes if missing, using existing design patterns.
9. Replace fixed-date ETA alerts with calculated values from real shipment dates. Do not implement the final dashboard aggregation yet.
10. Add permissions and tests for transitions, date validation, duplicate references, cross-tenant links, concurrent assignment, and dossier/vehicle synchronization.

Constraints:
- Customs document file bytes will be handled in the next file-storage phase; support metadata/relations cleanly without fake upload success.
- Do not call external carrier/customs APIs unless already configured and explicitly authorized.

Success criteria:
- Shipments and customs records are database-backed and linked correctly.
- Vehicle/dossier operational state stays consistent.
- `/expeditions` no longer uses mock data.

Validation:
Run migrations, Prisma validation, targeted backend/frontend tests, type checks, lints, and a purchase → shipment → customs smoke test.

Stop after shipping/customs integration and report the state machines and deferred external integrations.
```

---

## Prompt 14 — Implement file storage, documents, proofs, contracts, photos, and dossier notes

```text
Implement secure file/document handling and the dossier evidence domains.

Goal:
Replace in-memory filenames/data URLs and make vehicle photos, business documents, dossier documents, proofs, contracts, customs documents, receipts, and notes persistent and authorized.

Required work:
1. Inspect FileAsset, VehiclePhoto, BusinessDocument, CustomsDocument, dossier tabs, current FileReader usage, and all download/upload buttons.
2. Implement a storage-provider abstraction with a safe local development provider and a production-ready object-storage provider interface/configuration. Do not commit credentials.
3. Store file metadata in FileAsset with organization, uploader, checksum, size, MIME type, storage key, original name, created date, and soft-delete/retention metadata as appropriate.
4. Enforce MIME allowlists, maximum sizes, filename sanitization, authorization, tenant scope, and streaming. Do not trust client MIME values alone.
5. Implement upload/download/delete APIs for vehicle photos and business/dossier/customs documents. Use short-lived authorized download URLs or an authenticated streaming endpoint; never expose private storage buckets publicly.
6. Add explicit dossier document, proof, contract, and note models/relations if not already present. Notes need author and timestamps; important edits/deletions must remain auditable.
7. Define required proof/document rules by dossier type and workflow status. Enforce them in the backend dossier transition gate and return precise missing-requirement errors.
8. Integrate vehicle photo forms and dossier Documents/Preuves/Notes tabs, including progress, validation, retry, download, preview where appropriate, and empty/error states.
9. Ensure deleting a business record does not orphan storage objects or silently destroy legally relevant files. Implement a recoverable lifecycle/cleanup strategy.
10. Add tests for authorization, cross-tenant file IDs, MIME spoofing, size limits, duplicate checksums where relevant, missing proof gates, and cleanup behavior.

Constraints:
- Never store file bytes as base64 in JSON or database text fields.
- Do not claim upload success until both storage and database metadata are consistent.
- Avoid public permanent URLs for private documents.

Success criteria:
- Files persist across restarts and are accessible only to authorized tenant users.
- Dossier proof/document gates are enforced server-side.
- Previously nonfunctional upload/download controls work.

Validation:
Run migrations, storage integration tests, security tests, frontend tests/type/lint, and upload/download/denied-access smoke tests.

Stop after this phase and report storage configuration, limits, retention behavior, and validations.
```

---

## Prompt 15 — Implement tasks, notifications, and audit logging

```text
Implement internal tasks, notifications/templates, and audit logging across the Auto-Import ERP.

Goal:
Replace mock task/notification behavior and create reliable operational traceability.

Required work:
1. Inspect the existing Task, NotificationTemplate, Notification, AuditLog models, dossier mock tasks, notification page, and important mutation services.
2. Make these models tenant-safe with real User/Dossier/entity relations where feasible.
3. Implement task CRUD, assignment, due dates, priority, status transitions, comments or completion notes if required by the current UI, and dossier/entity linkage.
4. Implement notification-template management and in-app notification creation, list, unread count, mark-one/all-read, and user preferences.
5. Emit notifications for important domain events using a clear internal event mechanism after successful transactions. Avoid duplicate notifications on retries.
6. Implement immutable audit entries for security-sensitive and important business mutations, including actor, organization, action, entity type/ID, timestamp, and safe before/after metadata. Never store passwords, tokens, or raw file contents.
7. Add query APIs and permissions for authorized audit viewers. Ordinary users must not access organization-wide sensitive audit data unless allowed.
8. Integrate `/notifications`, top-bar unread count, dossier task tab, and any required task route/navigation using real APIs.
9. Add tests for assignment, overdue calculations, duplicate event handling, unread counts, cross-tenant access, audit redaction, and transaction/event consistency.

Constraints:
- Implement in-app notifications first. Do not send real email/SMS/WhatsApp messages unless a provider is already configured and explicitly authorized.
- Audit records must not be editable through normal CRUD.
- Do not implement dashboards/reports in this phase.

Success criteria:
- Tasks and notifications persist and update correctly.
- Important mutations create safe audit records.
- Notification and task UI no longer uses mock arrays.

Validation:
Run migrations, backend/frontend tests, type checks, lints, and task/notification/audit smoke tests with different roles.

Stop after this phase and report event design, audited operations, redaction rules, and results.
```

---

## Prompt 16 — Complete call-center follow-ups and communications

```text
Complete the CRM call-center and communications layer without pretending that external messaging providers are already connected.

Goal:
Add structured calls, outcomes, follow-ups, and communication history linked to prospects/clients/dossiers/users.

Required work:
1. Inspect prospect activities, frontend lead activity UI, User/Client/Prospect/Dossier relations, tasks, notifications, and audit/event infrastructure.
2. Add structured Call/Communication models or a well-designed typed interaction model supporting channel, direction, start/end or duration, outcome, notes, responsible agent, follow-up date, and related prospect/client/dossier.
3. Store recording metadata only when a real uploaded FileAsset exists. Do not fabricate recordings.
4. Replace string assignee references with tenant-safe User relations.
5. Implement list/create/update APIs with filters for agent, outcome, channel, date range, overdue follow-up, and related entity.
6. Create follow-up tasks and notifications transactionally when required. Completing a call must not create duplicate tasks on retry.
7. Integrate structured activities into lead/client timelines and add the minimum call-center views needed to manage due/overdue follow-ups while preserving the UI design.
8. Create provider interfaces/webhook verification boundaries for future email/WhatsApp/telephony integrations, but do not send external messages or accept unverifiable webhooks in this phase.
9. Add permissions, audit events, and tests for tenant isolation, duration/date validation, idempotent follow-ups, agent scope, file authorization, and timeline ordering.

Constraints:
- Do not claim WhatsApp/email/telephony delivery without a configured provider and real delivery receipt.
- Do not store arbitrary unverified webhook payloads as trusted business state.
- Preserve privacy by limiting recording/document access.

Success criteria:
- Agents can record calls/communications and manage follow-ups with persistent data.
- CRM timelines combine structured interactions and relevant activities in correct order.
- External integrations remain explicit, safe extension points.

Validation:
Run migrations, backend/frontend/security tests, type checks, lints, and an overdue-follow-up smoke test.

Stop after the CRM communications phase and report supported channels versus deferred provider integrations.
```

---

## Prompt 17 — Implement settings, dashboard, KPIs, reports, alerts, and exports

```text
Implement organization settings and all database-backed dashboards/reports only from authoritative transactional data.

Goal:
Replace hardcoded settings, dashboard arrays, fake KPIs, fixed dates, and report/export placeholders.

Required work:
1. Inspect the dashboard, `/rapports`, `/parametres`, canonical domain models, permissions, and current date/currency behavior.
2. Add tenant-scoped organization settings for company identity/contact, locale, timezone, base/reporting currency, notification preferences, and security settings that genuinely belong here. Encrypt or avoid sensitive configuration values.
3. Implement settings load/update APIs with validation, optimistic-concurrency protection where appropriate, and permissions. Connect the settings page and Save button.
4. Implement efficient aggregate APIs for:
   - dossier totals/distribution/active/recent;
   - available/reserved/in-transit/customs/sold vehicle stock;
   - collected revenue and outstanding/overdue invoices;
   - monthly revenue in the reporting currency;
   - collection rate;
   - prospect pipeline and outcomes;
   - client summaries;
   - offer availability/expiration;
   - shipping ETA and overdue operational alerts;
   - dossier revenue, cost, and margin.
5. Use confirmed/posted financial records only, explicit exchange rates, organization timezone, and real current dates. Prevent division-by-zero and mixed-currency errors.
6. Implement report filters by authorized date range, status, user/team, supplier, and currency as applicable.
7. Implement functional exports, at minimum CSV with safe formatting and permission checks. If PDF export already fits the project tooling, add it only after CSV and tests are correct.
8. Connect dashboard/reports/settings to real APIs with loading, empty, error, filter, and export states. Remove every hardcoded KPI/revenue/ETA source.
9. Optimize aggregate queries and add missing indexes identified by query plans for realistic tenant data volumes.
10. Add tests with fixtures that independently calculate expected values, especially currencies, overdue dates, status distributions, and tenant separation.

Constraints:
- Never compute KPIs from frontend mock arrays.
- Never convert currencies using a current rate when the transaction requires its historical rate.
- Do not expose another organization's aggregates through caches or exports.

Success criteria:
- All displayed KPIs and reports reconcile with database fixtures.
- Settings persist and affect locale/timezone/reporting calculations as designed.
- Export buttons produce real authorized files.

Validation:
Run backend/frontend tests, type checks, lints, query/performance checks, and reconcile several displayed KPIs manually against seeded test records.

Stop after reporting/settings are complete and report formulas, currency/timezone rules, query performance, and results.
```

---

## Prompt 18 — Remove all mocks and perform final production-readiness verification

```text
Perform the final integration and production-readiness phase for the Auto-Import ERP. Implement fixes found during validation; do not produce only an audit.

Goal:
Ensure the repository is one working application rather than a backend plus an in-memory prototype.

Required work:
1. Search every frontend file for imports/usages of `mockData.ts`, hardcoded business arrays, fake user switching, FileReader data URLs, fixed dates, placeholder handlers, and silent fallback data.
2. Replace every remaining business-data dependency with an implemented API or a truthful empty/unsupported state. Delete `mockData.ts` only when it has no legitimate consumers.
3. Verify every visible action/button. Implement missing in-scope handlers or remove/disable the control with an honest explanation; no clickable no-ops.
4. Fix the stale backend E2E test and add real HTTP contract/E2E coverage for the critical happy paths and failure paths.
5. Add/complete frontend unit/integration testing and browser E2E testing for at least:
   - login/refresh/logout and permissions;
   - lead → client conversion;
   - offer → dossier creation;
   - external request → candidate → purchase;
   - CIF, DDP, and shipping-only dossier progression;
   - 30/70 and 100% finance gates;
   - shipment/customs progression;
   - document/proof gates;
   - task/notification follow-up;
   - dashboard/report reconciliation.
6. Fix backend lint findings properly rather than globally disabling rules. Fix frontend warnings, generated `.next` type-state issues, and all TypeScript errors.
7. Run clean backend and frontend builds. Verify Prisma migrations from an empty disposable database and an upgrade path from the repository's prior schema if fixtures are available.
8. Add production deployment documentation and safe configuration examples: database, CORS, cookies/HTTPS, JWT/session secrets, file storage, migrations, seed restrictions, logging, backups, health checks, and reverse proxy.
9. Review security: sensitive-field serialization, authorization on every controller, tenant scoping, rate limiting for auth/upload endpoints, validation, headers, secrets, logs, dependency vulnerabilities, and private file access.
10. Review accessibility/responsiveness and render key frontend routes to catch layout regressions while preserving the established design.
11. Produce a final route-to-endpoint matrix and an honest list of any intentionally deferred external integrations. There must be zero unresolved mock-backed production features.

Constraints:
- Do not hide failures by disabling tests, lint rules, TypeScript checks, guards, validation, or error handling.
- Do not reset or destroy user data.
- Do not add fake data as a fallback for unavailable services.
- Preserve unrelated user changes and do not commit unless explicitly requested.

Success criteria:
- Backend tests, frontend tests, E2E tests, type checks, lints, Prisma validation/migrations, and production builds pass from a clean state.
- Critical flows work against PostgreSQL and persist across reload/restart.
- No user-facing KPI or domain record comes from hardcoded mock arrays.
- No known cross-tenant or sensitive-data issue from the original audit remains.

Stop only when the validation matrix has been completed or a concrete external blocker prevents it. Return:
1. completed fixes;
2. complete commands/results matrix;
3. remaining blockers with exact evidence;
4. deployment checklist;
5. intentionally deferred external-provider integrations.
```

---

## Recommended operating method

1. Create a backup branch before starting.
2. Give Codex Prompt 1 only.
3. Review the completion summary and `git diff`.
4. Run or confirm the listed tests.
5. Commit that phase if you are satisfied.
6. Continue with the next prompt.

If Codex stops after analysis without modifying the repository, reply:

```text
This phase is authorized for implementation. Continue from your findings, make the in-scope code changes, run the required validation, and stop only at the completion criteria or a concrete blocker requiring my decision.
```

If Codex discovers a decision that materially changes accounting, legal, or company workflow behavior, ask it to present the smallest set of options and their consequences before implementing that specific decision. It should continue all independent work that is not blocked by the decision.
