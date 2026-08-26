# Codex Task — Production UI Completion: Dashboard, China Offers, Vehicle Galleries, Targeted Notifications, Profile Security and PDF Reports

## Mission

Implement the following production-ready improvements in the existing Auto-Import ERP. This is not a prototype or mockup task. Preserve the completed Foundation, CRM/Call Center, commerce, finance, logistics, documents and Phase 3 behavior. Reuse the current architecture, contracts, permissions, private storage, tenant isolation, status workflows and design system.

Work directly from the repository’s current state. Inspect the four supplied screenshots at original resolution before changing code, then reproduce their information architecture, density, hierarchy and interaction patterns while remaining consistent with the existing application.

Complete the implementation end to end: schema only where genuinely necessary, safe migration, contracts, backend APIs, frontend pages/components, permissions, tests, real browser validation and documentation.

## Source-control and safety rules

- Start by running `git status`, identifying the current branch and inspecting existing uncommitted changes.
- Preserve all existing work. Do not reset, discard, overwrite or rewrite unrelated user changes.
- Do not commit, push, merge, rebase or switch branches unless explicitly requested.
- Do not modify any production/staging database, live storage or external provider configuration.
- Use only task-owned disposable PostgreSQL databases and storage directories for destructive verification.
- Do not edit an already-shared/applied migration. Add a later migration if the current schema needs changes.
- Do not introduce real personal information, real credentials, API keys or production secrets.
- Do not replace working modules with simplified rewrites.
- Never weaken tenant isolation, RBAC, audit logging, payment gates, document privacy or workflow constraints for UI convenience.

## Visual-reference files

The following files will be placed in `docs/ui-references/` before execution:

1. `dashboard.jpeg` — dashboard KPI cards, status bar chart, monthly revenue line chart, recent dossiers and alerts.
2. `offers-china.jpeg` — offer KPI cards, search/filter toolbar and detailed offer table.
3. `vehicles-grid.jpeg` — vehicle/stock search, filters, responsive cards, image/status badges and add action.
4. `vehicle-detail.jpeg` — vehicle detail modal, structured characteristics, options/equipment badges and supplier metadata.

Treat these images as visual acceptance references, not data sources. Do not hardcode their sample values, people, suppliers, vehicles, counts, prices or dates. Every displayed value must come from authenticated, tenant-scoped APIs and the real database.

If one of these files is absent, report the exact missing path and continue with all requirements that do not depend on visual comparison. Do not fabricate visual verification.

## Stage A — Baseline inspection and implementation map

Before editing:

1. Inspect the repository structure, `AGENTS.md` files, package scripts and current branch diff.
2. Inspect the existing Prisma schema/migrations and determine whether vehicle images and profile avatars can reuse `FileAsset`, `DossierDocumentAsset`, the Documents module or another canonical private-asset relation.
3. Inspect current Dashboard, Offers, Vehicles, Notifications, Reports, Users/Auth/Profile, navigation and top-bar implementations.
4. Inspect current shared contracts, `frontend/lib/*-api.ts` clients, permission resources and Swagger/OpenAPI conventions.
5. Identify the existing chart, modal, table, form, upload, toast and responsive-layout primitives. Reuse installed dependencies where appropriate.
6. Run the existing targeted tests, type checks and production builds to establish the baseline. Record failures that existed before this task.
7. Search production source for mocks, hardcoded business values, mojibake/replacement characters and unsafe type suppressions in the mission scope.

Write a concise implementation map before starting code. Do not spend time re-analyzing unrelated legacy modules.

## Stage B — Authoritative dashboard with responsive charts

Rework the dashboard to follow `dashboard.jpeg` at high visual fidelity.

### Required layout

- Header with `Dashboard` and `Vue d’ensemble de l’activité`.
- First row of four KPI cards:
  - total dossiers;
  - vehicles currently in stock, with available/reserved breakdown;
  - collected revenue in the organization’s base currency;
  - overdue invoices.
- Main analytics row:
  - dossiers by canonical status as an accessible bar chart;
  - monthly collected revenue as an accessible line chart.
- Lower row:
  - recent dossiers table with reference, client, vehicle(s), localized status and last update;
  - actionable alerts such as overdue invoices, imminent/late ETA, missed callbacks or other already-supported authoritative alerts.

### Data correctness

- Use the existing authoritative dashboard/report services; extend them rather than calculating business totals independently in React.
- All queries must be tenant-scoped and permission-aware.
- Revenue must obey the canonical finance rules: confirmed money only, exclude reversed payments, use the established allocation/deposit policy and convert using the existing base-currency/exchange-rate authority.
- Status counts must use canonical status values and the shared French presentation mapping.
- Monthly series must use a documented timezone and month boundary and return zero-filled missing months.
- Add a useful time-range selector only if it fits the existing design; default to a deterministic recent period such as the current year or trailing 12 months.
- Avoid N+1 queries and unbounded aggregation.

### UX and charts

- Reuse an installed chart library. If none exists, select one small, maintained React-compatible library and document the dependency decision.
- Charts must have tooltips, readable labels, keyboard/screen-reader context, responsive sizing and correct currency/count formatting.
- Long status labels must remain readable without overlapping as in the reference; use horizontal bars, abbreviation with tooltip or responsive label handling if needed.
- Provide real loading skeletons, empty states, partial-error/retry states and permission-aware visibility.
- No fabricated fallback values and no static chart arrays.

## Stage C — China Offers workspace

Rework `/offres` and its supporting components to follow `offers-china.jpeg`.

### Required page structure

- Header: `Offres Chine` and `Catalogue véhicules fournisseurs chinois`.
- KPI cards for total, available, reserved, sold/materialized and expired offers, computed by the backend from canonical state.
- Search and filters for status and vehicle condition, preserving the current query in URL search parameters where practical.
- Permission-aware `Nouvelle offre` action.
- Desktop table with at least:
  - primary photo thumbnail;
  - vehicle name and offer reference;
  - supplier and city/location;
  - year;
  - condition;
  - CIF price;
  - DDP price;
  - purchase price;
  - remaining availability;
  - derived/canonical status;
  - validity date;
  - view/open actions.
- Correct server pagination rather than fetching an unbounded list.
- A responsive mobile representation that preserves all important fields without forcing an unusable desktop-width table.

### Business integrity

- Preserve existing reservation, release, expiry, oversubscription and materialization rules.
- Do not allow the frontend to set a derived status directly.
- KPI counts and filtered rows must reconcile against the same backend authority.
- Money must retain currency codes and safe decimal handling; do not calculate currency values using JavaScript floating-point arithmetic.
- Thumbnail access must respect the current private-file authorization model.

## Stage D — Vehicle stock, three-photo galleries and creation form

Rework `/vehicules` and its detail/create/edit experiences to follow `vehicles-grid.jpeg` and `vehicle-detail.jpeg`.

### Vehicle grid

- Search by VIN, make and model.
- Filter by canonical status and source.
- Responsive card grid: approximately four columns at wide desktop, then sensible tablet/mobile breakpoints.
- Each card must show:
  - primary vehicle photo with consistent aspect ratio and object-fit;
  - canonical status badge;
  - condition badge;
  - photo-count badge;
  - make/model, year and exterior color;
  - fuel, transmission and mileage;
  - source badge;
  - formatted price and `Voir détails` action.
- Cards and actions must be keyboard accessible and have correct image alt text.

### Exactly three vehicle photos

- New vehicles must be created with exactly three distinct real photos. Do not satisfy this requirement by duplicating one file or inserting metadata without bytes.
- Add/edit forms must expose three ordered upload slots with clear labels such as front, rear and interior/side. Allow preview, replacement and removal before submission.
- The first ordered image is the cover image; support deterministic reordering if consistent with the current component system.
- Validate file count, allowed formats, magic bytes and configured size limits on both frontend and backend.
- Reuse the existing private file-storage abstraction and tenant-scoped authorization. Never store raw image bytes in PostgreSQL or expose filesystem paths.
- Persist a stable image order and relation to the vehicle. Add schema/migration/contracts only if the current asset model cannot express this safely.
- Make create/update plus file persistence failure-safe: no orphan database rows, orphan files or vehicle records claiming nonexistent assets. Use staging/finalization or explicit compensating cleanup consistent with the existing storage architecture.
- Existing legacy vehicles with fewer than three real photos must display an `Photos incomplètes` administrative state and remain readable. Do not fabricate missing files. Require completion to exactly three photos on their next edit.
- Update deterministic demo seeding/fixtures so demo vehicles each receive three valid real image fixtures and idempotent reruns do not duplicate assets.

### Detail experience

- Open a high-fidelity detail modal/drawer from `Voir détails`.
- Include an accessible three-photo gallery with thumbnails and selected-image state.
- Reproduce the reference’s structured presentation for status/source/condition and characteristics such as body type, fuel, transmission, engine, power, displacement, doors, seats, steering, colors/interior and warranty when those fields exist.
- Display options and equipment as badges, plus supplier and creation metadata.
- Do not invent missing characteristics. Render a deliberate `Non renseigné` or omit optional fields consistently.
- Support Escape, focus trap, close button, restored focus and mobile scrolling.

## Stage E — Administrator-targeted notifications

Extend the existing persistent notification system; do not create a parallel mock notification store.

### Permissions

- Add or reuse a canonical permission such as `notifications:send`.
- Grant it to the platform/super administrator in the deterministic seed and expose the compose UI only to authorized users.
- Enforce permission and tenant scope in the backend. Hiding the button is not authorization.

### Compose experience

Authorized administrators must be able to send an in-app notification to:

- one or multiple explicitly selected active users;
- one or multiple tenant roles/departments such as Finance, Logistics or Commercial, based on the repository’s actual role model;
- optionally all active users in their own organization.

Provide searchable multi-select recipients, title, message, category/severity and an optional safe internal entity link. Show the resolved unique recipient count before confirmation.

### Delivery behavior

- Resolve recipients server-side and never accept cross-tenant user/role identifiers.
- Deduplicate users who match multiple selections so each send produces one logical notification per recipient.
- Persist each notification and emit the existing organization/user-isolated real-time event.
- Unread counters, read state and reload persistence must continue to work.
- Reject empty audiences, inactive users where appropriate, excessive message lengths and unsafe external/JavaScript links.
- Record a redacted audit event containing sender, audience type/count and notification metadata—not secrets or full sensitive content.
- Return a useful delivery summary without leaking users the sender cannot enumerate.
- This stage concerns in-app notifications. Do not silently claim email, SMS, WhatsApp or browser-push delivery.

## Stage F — Profile page, avatar and secure self-service password change

Create a real authenticated profile workspace using the established French route convention, preferably `/profil` unless the repository already defines another canonical path.

### Profile UI

- Make the top-bar user menu link to the profile page.
- Show user name, normalized email, roles, office/organization context and account status as appropriate.
- Add an avatar upload/change/remove flow with preview, loading, success and failure states.
- Update the top bar immediately after a successful avatar change; retain the initials fallback.
- Store the avatar through the private asset/storage abstraction, with tenant/user authorization, MIME magic-byte validation, size limits and orphan cleanup.
- Never expose the physical path or trust an upload extension alone.

### Password change

- Allow an authenticated active user to change their own password by entering:
  - current password;
  - new password;
  - confirmation.
- Verify the current password server-side and apply the project’s password-strength policy.
- Never accept a target user ID for self-service password change.
- Never log, echo, audit or return either password.
- Rate-limit or otherwise protect repeated password attempts using the existing security approach.
- On success, revoke all other refresh sessions. Keep or rotate the current session safely according to the current opaque-refresh-session architecture, and document the exact behavior.
- Return neutral errors that do not reveal authentication internals.
- Preserve the separate administrator-driven password-reset capability and permissions.

## Stage G — Navigation and audit visibility

- Remove the Audit item from the sidebar/navigation as requested.
- Do **not** delete the audit database models, append-only records, backend service, permission checks or security tests.
- Do not erase audit history.
- If the existing audit route remains intentionally accessible to directly authorized administrators, keep it protected and simply remove normal navigation exposure. Document this behavior.
- Verify that sidebar active states, responsive drawer and keyboard navigation remain correct after removal.

## Stage H — Replace user-facing CSV exports with PDF reports

Replace the Reports UI’s CSV export action with a real PDF export.

### Backend PDF contract

- Generate the PDF from the same authoritative, tenant-scoped, permission-filtered report query used by the visible report.
- Preserve all applied filters, date ranges and report type.
- Stream bytes from the backend with `Content-Type: application/pdf` and a safe `Content-Disposition` filename.
- Use a server-side PDF implementation suitable for the current NestJS stack. Reuse an installed dependency when reasonable; justify any new production dependency.
- Do not generate a fake PDF by renaming CSV/HTML, and do not expose local storage paths.
- Do not load an unbounded dataset into memory. Use documented limits, pagination/chunking or streaming appropriate to the selected library.
- The PDF must contain:
  - organization identity/name;
  - French report title;
  - selected filters and date range;
  - generation timestamp and requesting user;
  - KPI summary;
  - readable tables for the selected report;
  - page number/total and repeated headers where supported;
  - correct DZD/foreign currency formatting;
  - embedded Unicode-capable font so French accents and Arabic text render correctly.
- Use portrait or landscape A4 according to report width and avoid clipped columns.
- Sanitize content and prevent formula/HTML/path injection from database fields.

### Frontend behavior

- Replace the visible `Exporter CSV` action with `Exporter PDF`.
- Preserve the current report filters when requesting the export.
- Handle authenticated binary download correctly with a loading state, disabled duplicate clicks, meaningful error handling and a safe filename.
- Do not place access tokens in URLs.
- If an old CSV API must temporarily remain for compatibility, remove it from the user-facing UI and mark/document it as deprecated; do not break unrelated consumers without evidence.

## Stage I — Cross-cutting quality requirements

- Maintain the existing visual language: white surfaces, subtle borders, restrained shadows, black primary actions, blue links and semantic status colors.
- Match the screenshots’ spacing, hierarchy, card radii, table density and typography without copying their sample data.
- All changed surfaces must work at desktop `1440×1100`, tablet and mobile `390×844`.
- Use semantic HTML, visible focus states, labels, accessible dialog behavior and non-color-only status communication.
- Preserve French accents and valid UTF-8. Remove any mission-scoped mojibake or replacement characters encountered.
- No `mockData` imports, fabricated fallback records, `any`, `@ts-ignore` or `@ts-nocheck` in new/modified production code.
- Keep frontend API calls in typed API-client modules rather than scattered raw `fetch` calls.
- Use canonical response envelopes, pagination and shared enum/presentation mappings.
- Avoid leaking `passwordHash`, token hashes, refresh tokens, storage paths, internal errors or cross-tenant identifiers.
- Do not expose controls the current user lacks permission to execute.
- Preserve loading, empty, error, retry, validation, conflict and forbidden states.

## Required tests

Add focused tests that prove behavior, not snapshots alone.

### Backend

- Dashboard aggregation, month zero-fill, reversed-payment exclusion and tenant isolation.
- Offer KPI/list reconciliation and derived-status filtering.
- Vehicle photo count/order, MIME validation, tenant authorization, file/row cleanup and legacy incomplete behavior.
- Notification send permission, recipient resolution, tenant isolation, deduplication, inactive-recipient behavior, persistence and real-time isolation.
- Self password change: correct current password, wrong password, validation, session revocation/rotation and response-secret absence.
- Avatar upload authorization, MIME validation, replacement/removal and orphan cleanup.
- PDF endpoint permission/tenant filters, `%PDF-` signature, content type/disposition, filter fidelity, French accents and no secret leakage.

### Frontend

- Dashboard loading/empty/error/data and chart rendering from API results.
- Offer filters/pagination and responsive representations.
- Vehicle three-photo form validation, previews, reorder/replacement, detail gallery and incomplete legacy state.
- Notification recipient modes and delivery summary.
- Profile avatar and password forms, validation and session outcome.
- PDF download request carries filters and handles binary/error states.
- Audit sidebar item is absent without breaking navigation.

Do not weaken assertions or delete existing tests just to get green output.

## Required disposable-database and browser validation

Use a new task-owned disposable PostgreSQL database and disposable private-storage directory:

1. Deploy all migrations from zero.
2. Run Prisma validate and generate.
3. Run deterministic base/demo seed twice and prove logical/file idempotency.
4. Verify zero schema drift.
5. Verify every demo vehicle has three distinct real image bytes and correct ordered metadata.
6. Start backend and frontend with task-owned ports.
7. Run the full relevant authenticated API smoke journey.
8. Run a real Chromium/Chrome browser journey with an administrator and restricted user.

The browser journey must verify:

- dashboard KPI/chart values agree with API data and remain readable at desktop/mobile widths;
- offers KPI cards, search, filters, pagination, row/detail actions and responsive behavior;
- vehicle creation with three uploads, reload persistence, cover/count, detail gallery and edit replacement;
- a fourth photo is rejected and fewer than three blocks a new vehicle submission;
- administrator sends individual, Finance-role and Logistics-role notifications;
- deduplicated recipients receive one notification, real-time badge updates, and read state survives reload;
- unauthorized user cannot compose notifications or access cross-tenant recipients;
- profile avatar updates in the top bar and persists after reload;
- password change rejects a wrong current password, succeeds with the correct one, and enforces the documented session behavior;
- Audit is absent from the sidebar;
- each report exports a valid openable PDF containing the selected filters and correct accented French text;
- no broken images, horizontal overflow, mojibake, uncaught console errors, hydration errors or failed network calls.

Capture task-owned screenshots or artifacts for verification if the repository’s existing smoke tooling supports them. Clean up only task-created databases, storage and processes afterward.

## Validation commands

Discover and use the repository’s actual scripts. At minimum report exact commands, exit codes and counts for:

- Prisma validate/generate/migrate deploy/status/diff;
- deterministic seed twice;
- backend unit tests and E2E;
- frontend tests;
- backend and frontend TypeScript checks;
- backend and frontend production builds;
- mission-scoped lint with zero new warnings/errors;
- existing contract/OpenAPI tests;
- real browser desktop/mobile journeys;
- `git diff --check`;
- a secret/artifact census for modified files.

Repository-wide legacy lint debt outside this mission must be counted and reported separately, not silently attributed to this work. Do not claim a check passed if it was not executed.

## Completion criteria

The task is complete only when:

- the dashboard matches the reference structure and uses correct live data;
- China Offers matches the reference structure and preserves commerce invariants;
- every newly created vehicle requires exactly three persisted, ordered, private real photos;
- vehicle cards and details match the reference experience responsively;
- authorized administrators can send persistent real-time notifications to tenant users and role audiences such as Finance and Logistics;
- users have a secure profile avatar and self-service password change;
- Audit is removed from navigation but audit integrity remains intact;
- Reports exposes working tenant-safe PDF export instead of CSV;
- all new migrations, tests, builds and browser journeys pass;
- no mocks, secrets, fake files, cross-tenant leaks or unrelated regressions are introduced.

If blocked by a genuinely destructive/data-ownership decision, stop before that destructive action and report exact evidence plus the safest alternatives. Otherwise, diagnose and fix mission-scoped failures rather than stopping after the first issue.

## Final response format

Return a concise handoff with exactly these sections:

1. **Baseline and files changed**
2. **Dashboard and visual implementation**
3. **Offers and vehicle galleries**
4. **Notifications, profile and security**
5. **PDF reporting**
6. **Migration/data-safety evidence**
7. **Validation matrix** — exact commands, exit codes and test counts
8. **Browser evidence** — roles, routes, viewport sizes and scenarios
9. **Remaining blockers** — concrete only, or `none`

Explicitly state whether any migration, production database, external provider, commit or push was performed. Do not repeat this prompt and do not fabricate validation.
