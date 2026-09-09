# Catalogue → dossier: root cause and verification

Verified locally on 2026-09-09 against PostgreSQL 17 with all 34 repository migrations, the real Nest application, Chrome, and the rebuilt production backend image. Production was not accessed; these are reproduced application failures, not a claim to have recovered the original VPS logs.

## Confirmed failures before the fix

1. **Create succeeds, opening the new dossier fails.** `POST /api/dossiers` returns 201 for a published catalogue quotation. The wizard immediately navigates to the new dossier; `GET /api/dossiers/:id` returns 500 with `[DecimalError] Invalid argument: undefined`. Stack: `new Decimal` → `ConfigurationService.refreshDossierPricing` → `DossiersService.findOne`. No Prisma constraint is involved in this failure: the Decimal constructor throws before an update can run.
2. **Reference allocation can remain stuck.** A historical `CA-<year>-00051` with `CommerceSequence.value = 50` causes Prisma `P2002` on the dossier's `(organizationId, reference)` unique constraint inside `dossier.create`. Transaction rollback also rolls back the sequence increment, so subsequent attempts repeat the same collision. A missing sequence beside an existing first reference has the same problem.
3. **Zero optional quotation costs can fail before catalogue publication.** Prisma inserts into the mapped `QuotationOtherCost` table; PostgreSQL returns `23514` for its `amount > 0` check. Decimal's `isPositive()` accepts positive zero. The database constraint is correct; the cost filter was not.

These were exercised against the real migrated database, not by injecting a simulated Prisma exception. There is no evidence that a timeout, Redis, a rebuild, or an expired Finance cache caused the primary failure.

## Complete request and domain flow

1. `frontend/components/commerce/DossierWizardWorkspace.tsx` loads eligible catalogue choices and selects the existing CIF/DDP dossier type. Its request contains `clientId`, `type`, `catalogueItemId`, optional stock `vehicleIds`, and optional staff IDs. It does **not** send price or currency.
2. `frontend/lib/commerce-api.ts` submits `POST /api/dossiers`. `DossiersController.create` receives `CreateDossierDto`; UUID, enum, array uniqueness and unknown-field validation remain enabled. The authenticated organization is supplied by the backend, not trusted from the payload.
3. `DossiersService.create` validates the client/staff/stock references. Its transaction allocates an organization/year reference and loads the organization-scoped `CatalogueItem`, its `ChinaOfferVehicle` and parent `ChinaOffer`, and the selected published quotation/current revision.
4. It atomically reserves catalogue, source vehicle and parent offer quantities, creates the dossier and initial status history, and links an optional existing reservation. A failure rolls all these writes back.
5. Catalogue selection is not a stock `Vehicle` ID. Its commercial source is `ChinaOfferVehicle`; any stock vehicles are separately attached through `DossierVehicle`. A dossier does not create a new China offer, resolve current Finance rates, or recalculate a published quotation.
6. Foreign supplier/cost currency belongs to the offer and quotation-cost snapshots. The published customer revision supplies `finalCustomerPriceDzd`. A CIF dossier stores **only CIF**; a DDP dossier stores **only DDP**. Both store `priceCurrency = DZD`, `priceLockedAt`, `commercialQuotationId` and `commercialQuotationRevisionId`.
7. Navigation triggers `GET /api/dossiers/:id`. Previously the calculator understood a one-basis snapshot, but the refresh writer assumed a locked dossier always had **both** prices and attempted `Decimal(undefined)` for the absent basis. This inconsistent invariant is the primary root cause.

## Fix and historical-data safety

- `priceLockedAt` is authoritative. Locked pricing is read without rewriting it or requiring the other basis. An incomplete historical snapshot is reported unavailable with the missing fields, never silently recalculated or replaced with zero.
- Unlocked refresh validates calculation output before Decimal construction and uses an organization-scoped conditional update (`priceLockedAt: null`) so it cannot overwrite a concurrent lock.
- Sequence collisions are reconciled against actual organization/year references, including archived dossiers, while holding the existing sequence row lock. Common non-collision allocation does not scan all references. No destructive resequencing or arbitrary retries.
- Source/revision tenant identity, quotation basis, publication/expiry and finite positive DZD price are checked before inventory writes. Invalid references/pricing and concurrent stock changes return controlled 404/409 responses. Parent stock reservation now has the same atomic availability guard as its children.
- The transaction boundary logs the failing operation, organization, actor, catalogue ID, Prisma code and stack. Sensitive request payloads are not logged. Unexpected failures still return 500; they are not hidden. Known relation/unique conflicts return clean business errors.
- Strict `gt(0)` replaces the related incorrect `isPositive()` uses in quotation-cost persistence, purchase/customs cost handling and zero-denominator profitability guards. Optional zero costs remain zero in calculations but do not create forbidden accounting rows.
- Existing quotation revisions and their original amount/currency/rate/DZD snapshots are unchanged when Finance rates are deactivated, changed, or replaced. A new quotation without a required rate still returns 409. A dossier using an already-published valid quotation does not require today's rate.

## Files changed

| File | Purpose |
| --- | --- |
| `backend/src/configuration/configuration.service.ts` | Correct one-basis historical snapshot reads and concurrent-lock-safe refresh. |
| `backend/src/configuration/dossier-pricing.spec.ts` | CIF-only/DDP-only/both, incomplete snapshot and concurrent-lock regressions. |
| `backend/src/dossiers/dossiers.service.ts` | Reference repair, source/pricing validation, parent stock guard and contextual diagnostics. |
| `backend/src/offers/quotation-pricing.service.ts` | Strictly positive persisted costs and denominator check. |
| `backend/src/offers/quotation-pricing.service.spec.ts` | Zero optional-cost regression; typed test access without unsafe `bind`. |
| `backend/src/finance/costs.service.ts` | Reject zero purchase commitment and skip zero customs posting. |
| `backend/src/finance/profitability-calculation.ts` | Prevent zero selling amount from becoming a valid denominator. |
| `backend/src/finance/profitability-calculation.spec.ts` | Zero-selling-price regression. |
| `backend/test/dossier-catalogue.e2e-spec.ts` | Real PostgreSQL/API integration, application restart, optional Chrome and Docker restart tests. |
| `backend/test/helpers/dossier-browser.mjs` | Existing wizard interaction in Chrome with real API response assertions. |
| `docs/operations/dossier-catalogue-root-cause.md` | Evidence, limitations and reproduction/deployment instructions. |

No frontend implementation, design, DTO, Prisma schema or migration change is required. Next's temporary test-directory additions to frontend TypeScript configuration are excluded from the patch.

## Database verification

All 34 migrations applied to a clean disposable database. Re-running `prisma migrate deploy` is safe and `prisma migrate status` reports up to date. SQL inspection confirms `ChinaOffer.cifPrice/ddpPrice` and `Dossier.cifPrice/ddpPrice/priceCurrency` are nullable as declared, and the positive-cost/stock/unique constraints are present. The previous nullable-offer fix remains intact.

Read-only Prisma migration diff did show pre-existing differences elsewhere: database-generated UUID/timestamp defaults versus client defaults, index-name normalization, a Cost composite index, and GED/prospect index/FK differences. These were not applied or folded into this fix. A broad generated migration would be inappropriate.

The existing local development/staging database containers had no tables or migration history. The regression suite therefore uses only an explicitly named localhost `codex_dossier_fix_*` database and refuses other targets. Fixtures are test-only database records, not production fallback/mock data. The VPS migration state still requires verification against its actual configured database.

## Checks and repeatable local verification

- Backend: `npm test -- --runInBand` — 67 suites, 390 tests pass.
- Frontend: `npm test` — 20 files, 49 tests pass.
- Combined PostgreSQL/API/Chrome/Docker suite: 20 tests pass, none skipped, with both optional acceptance flags enabled.
- Backend and frontend `npm run build` pass, including TypeScript compilation.
- ESLint passes for every changed TypeScript source/test file; the standalone browser helper is checked with `node --check` and Prettier (it is outside the TypeScript ESLint project).
- Real-database coverage: USD/CNY × CIF/DDP; both published bases; nullable legacy offer prices; offer update; stock vehicles with DZD/USD/CNY; invalid vehicle/currency/payload/pricing; unpublished/expired/foreign-tenant quotations; absent revisions; reference collisions and missing sequences; concurrent last-unit reservation and rollback; zero costs; missing Finance rate; historical snapshots and application restart.
- Chrome uses the existing catalogue detail and dossier wizard, asserts POST 201, GET 200, rendered dossier reference and the persisted catalogue link. It does not intercept API responses.
- The rebuilt runtime image runs with `NODE_ENV=production` and local HTTP staging configuration; create/read is checked before and after an actual Docker container restart.

PowerShell reproduction (only the named disposable database):

```powershell
docker run --name auto-import-dossier-repro -e POSTGRES_USER=dossier_test -e POSTGRES_PASSWORD=dossier_test_local_only -e POSTGRES_DB=codex_dossier_fix_20260909 -p 127.0.0.1:55439:5432 -d postgres:17-bookworm
$env:DATABASE_URL='postgresql://dossier_test:dossier_test_local_only@127.0.0.1:55439/codex_dossier_fix_20260909'
# From backend:
npx prisma migrate deploy
npm run test:e2e -- --runInBand test/dossier-catalogue.e2e-spec.ts
```

For the two optional acceptance tests, build the image from the repository root:

```powershell
docker build -f backend/Dockerfile.production --target runtime -t auto-import-dossier-verified:local .
```

In a separate frontend terminal:

```powershell
$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:55440/api'
$env:BACKEND_INTERNAL_URL='http://127.0.0.1:55440'
$env:NEXT_DIST_DIR='.next-dossier-repro'
npm run dev -- --hostname 127.0.0.1 --port 55441
```

Then in the backend terminal with the test database URL set:

```powershell
$env:DOSSIER_BROWSER_URL='http://127.0.0.1:55441'
$env:DOSSIER_CONTAINER_IMAGE='auto-import-dossier-verified:local'
npm run test:e2e -- --runInBand test/dossier-catalogue.e2e-spec.ts
```

Chrome defaults to the Windows installation path; override `CHROME_PATH` if needed. Docker acceptance uses Docker Desktop's `host.docker.internal` to reach the disposable database. Ports 55440–55443 must be free. The suite leaves only isolated fixtures in the disposable database; it removes its temporary browser/storage directories and runtime container. Do not point these tests at a client database.

## VPS deployment and remaining production verification

Use the existing deployment directory, reviewed `.env.production`, normal database backup procedure and intended main branch. Never print secrets or substitute a local database URL. No new environment variable is needed by this fix.

```sh
git status --short
git branch --show-current
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.production.yml build backend migrate
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate npx prisma migrate status
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps backend
docker compose --env-file .env.production -f docker-compose.production.yml ps backend
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 100 backend
```

The migrate image runs `npx prisma migrate deploy`, never `db push` or reset. Review pending migrations before deploying; this patch adds none. Inspect the VPS table metadata with a read-only database connection if migration history or nullability differs. Confirm its configured database/organization against the affected client before changing anything.

After deployment, verify the client's original catalogue selection: POST 201, redirected GET 200, correct selected DZD price, unchanged historical dossier snapshot. Match any remaining production failure's request method/path and backend operation log; do not assume that every generic 500 has the same cause.

Build notes: the existing dependency tree emits an npm audit summary (2 moderate, 8 high) and PostgreSQL driver concurrent-query deprecation warnings. Dependencies were not upgraded in this narrowly scoped financial/domain fix. These are separate follow-up items, not suppressed verification failures or proof of the reproduced root cause.
