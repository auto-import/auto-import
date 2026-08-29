# ERP V2 — exact local exhaustive verification continuation

Run from a clean checkout of the Phase 6 checkpoint in Windows PowerShell.
These commands do not access staging/VPS and use only a new labeled disposable
PostgreSQL container. Do not substitute an existing database URL.

## 1. Provenance and static gates

```powershell
git rev-parse --verify HEAD
git status --short
git diff --check
node backend/scripts/check-erp-v2-release-artifacts.mjs

Push-Location backend
npx prisma format
npx prisma validate
npx prisma generate
npx eslint "{src,apps,libs,test}/**/*.ts"
npm test -- --runInBand
npm run build
Pop-Location

Push-Location frontend
npm test
npm run lint
npm run test:text
npm run build
Pop-Location
```

Record the known baseline separately: backend ESLint previously reported 546
errors and 200 formatting findings; frontend lint reported 13 legacy fixture
warnings and zero errors. Do not use `--fix` on the full backend suite.

## 2. Fresh full migration chain

```powershell
docker run --name auto-import-erp-v2-final-fresh `
  --label auto-import.disposable=erp-v2-final-fresh `
  --tmpfs /var/lib/postgresql/data:rw `
  --publish 55446:5432 `
  --env POSTGRES_USER=erpv2 `
  --env POSTGRES_PASSWORD=erpv2_disposable `
  --env POSTGRES_DB=erpv2_final_fresh `
  --detach postgres:17-alpine

docker exec auto-import-erp-v2-final-fresh pg_isready -U erpv2 -d erpv2_final_fresh
$env:DATABASE_URL='postgresql://erpv2:erpv2_disposable@localhost:55446/erpv2_final_fresh?schema=public'
Push-Location backend
npx prisma migrate deploy
npx prisma migrate status
Pop-Location
Remove-Item Env:DATABASE_URL
```

Run every post-migration report:

```powershell
$reports = @(
  'backend/scripts/erp-v2-phase1-crm-reconciliation-readonly.sql',
  'backend/scripts/erp-v2-phase1-migration-verify-readonly.sql',
  'backend/scripts/erp-v2-phase2-ged-reconciliation-readonly.sql',
  'backend/scripts/erp-v2-phase3-suppliers-offers-reconciliation-readonly.sql',
  'backend/scripts/erp-v2-phase4-finance-reconciliation-readonly.sql',
  'backend/scripts/erp-v2-phase5-logistics-reconciliation-readonly.sql'
)
foreach ($report in $reports) {
  Get-Content -Raw -LiteralPath $report |
    docker exec -i auto-import-erp-v2-final-fresh psql -v ON_ERROR_STOP=1 -U erpv2 -d erpv2_final_fresh
  if ($LASTEXITCODE -ne 0) { throw "Report failed: $report" }
}
```

Before removal, verify the exact label and name:

```powershell
docker inspect --format '{{json .Config.Labels}} {{.Name}}' auto-import-erp-v2-final-fresh
docker rm --force auto-import-erp-v2-final-fresh
docker ps -a --filter "label=auto-import.disposable" --format "{{.Names}} {{.Status}} {{.Labels}}"
```

## 3. Representative pre-V2 migration and concurrency/E2E

Use the repository harness for its representative Phase 1 fixture, then extend
the disposable fixture with non-destructive supplier/offer/document/finance/
shipment/customs rows and apply migrations 2–5. Preserve all report output.

```powershell
Push-Location backend
npm run test:e2e:phase1-release-gate
node scripts/test-erp-v2-phase1-database.mjs
npm run test:migration:phase2-fileasset
npm run test:phase3:isolation
Pop-Location
```

Add authenticated integration coverage for:

- GED multipart upload/version/checksum corruption and sensitive denial;
- supplier bank metadata/reveal denial/audit, offer revision and concurrent assignment;
- contract deposit/multiple payments, concurrent confirmation, ledger
  idempotency, treasury balance and authorized reversal;
- multi-vehicle arrival automation, ambiguous Dossier proposal, duplicate
  customs prevention and port-exit delivery handoff;
- cross-tenant denial for every new detail/action endpoint.

## 4. Production-image build/runtime inspection (local only)

Use a local non-production environment file with disposable endpoints. Do not
use staging credentials or connect the containers to staging/prod.

```powershell
docker build --target migrate -f backend/Dockerfile.production -t auto-import-migrate:erp-v2 .
docker build --target runtime -f backend/Dockerfile.production -t auto-import-backend:erp-v2 .
docker build --target runtime -f frontend/Dockerfile.production -t auto-import-frontend:erp-v2 .

docker run --rm --entrypoint sh auto-import-backend:erp-v2 `
  -ceu 'test -f scripts/erp-v2-authenticated-readonly-smoke.mjs; test -f scripts/erp-v2-phase1-authenticated-smoke.mjs; test -f scripts/erp-v2-phase1-migration-verify-readonly.sql; test -f scripts/erp-v2-phase2-storage-preflight.mjs; test -f scripts/erp-v2-phase5-logistics-reconciliation-readonly.sql'
docker image inspect auto-import-migrate:erp-v2 auto-import-backend:erp-v2 auto-import-frontend:erp-v2 `
  --format '{{.Id}} {{json .Config.Healthcheck}}'
```

Run the complete local Compose runtime only against a new disposable database,
then execute `npm run smoke:erp-v2:readonly` inside the backend container and
the Phase 1 authenticated synthetic smoke. Never print credential environment
values or use verbose curl.

## 5. Closeout

```powershell
git diff --check
git status --short
docker ps -a --filter "label=auto-import.disposable" --format "{{.Names}} {{.Status}} {{.Labels}}"
```

Update `docs/erp-v2-progress.md` with exact counts, durations, Docker image IDs,
representative reconciliation values, and any failures classified as baseline
or regression. Do not deploy, push or merge as part of this verification.
