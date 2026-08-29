# ERP V2 — Linux/Docker Compose release runbook

This is an operator-only runbook for the reviewed staging stack. It uses
`.env.staging`, `docker-compose.staging.yml`, services `postgres`, `migrate`,
`backend`, `frontend`, `nginx` (plus internal `redis`), and database
`auto_import`. It does not authorize an agent to access or change a VPS.

## 1. Review provenance and Compose without exposing secrets

```bash
set -euo pipefail
umask 077
test -f .env.staging
test -f docker-compose.staging.yml
test "$(stat -c '%a' .env.staging)" = 600
git rev-parse --verify HEAD
git status --short
git diff --check
test -z "$(git status --porcelain)" || { echo 'STOP: dirty checkout' >&2; exit 1; }

RELEASE_COMMIT="$(git rev-parse HEAD)"
read -r -p 'Previously deployed reviewed commit SHA: ' PREVIOUS_APP_COMMIT
git cat-file -e "${PREVIOUS_APP_COMMIT}^{commit}"
printf '%s\n' "$RELEASE_COMMIT" > erp-v2-release-commit.txt
printf '%s\n' "$PREVIOUS_APP_COMMIT" > erp-v2-previous-app-commit.txt

dc() { docker compose --env-file .env.staging -f docker-compose.staging.yml "$@"; }
dc config --quiet
dc ps
```

Do not run `docker compose config` without `--quiet`; rendered output may
contain credentials. Do not print or echo `DATABASE_URL`.

## 2. Start and verify only PostgreSQL for preflight

```bash
dc up -d postgres
dc exec -T postgres sh -ceu 'pg_isready --username="$POSTGRES_USER" --dbname=auto_import'
test "$(dc exec -T postgres sh -ceu \
  'psql --username="$POSTGRES_USER" --dbname=auto_import -X -Atqc "select current_database()"')" = auto_import
install -d -m 700 erp-v2-reports backups
REPORT_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
```

Run every pre-migration report read-only:

```bash
for report in \
  backend/scripts/erp-v2-preflight-readonly.sql \
  backend/scripts/erp-v2-phase2-ged-preflight-readonly.sql \
  backend/scripts/erp-v2-phase3-suppliers-offers-preflight-readonly.sql \
  backend/scripts/erp-v2-phase4-finance-preflight-readonly.sql \
  backend/scripts/erp-v2-phase5-logistics-preflight-readonly.sql
do
  name="$(basename "$report" .sql)"
  dc exec -T postgres sh -ceu \
    'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
    < "$report" | tee "erp-v2-reports/${REPORT_UTC}-${name}.txt"
done

dc run --rm migrate npx prisma migrate status --schema prisma/schema.prisma
```

Stop before migration when there is unexplained cross-tenant ownership,
ambiguous people/supplier/customs identity, missing file bytes/checksums,
unknown workflow mapping, source loss, or historical finance rows lacking an
approved FX/validator/account reconciliation disposition. Never merge or fill
ambiguous values automatically.

## 3. Final logical backup and validation

Pause application writes, then create a custom-format logical backup:

```bash
dc stop nginx frontend backend
BACKUP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="backups/auto_import-pre-erp-v2-${BACKUP_UTC}.dump"
dc exec -T postgres sh -ceu \
  'exec pg_dump --username="$POSTGRES_USER" --dbname=auto_import --format=custom --no-owner --no-acl' \
  > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
dc exec -T postgres sh -ceu 'exec pg_restore --list' < "$BACKUP_FILE" > /dev/null
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
sha256sum --check "${BACKUP_FILE}.sha256"
chmod 600 "$BACKUP_FILE" "${BACKUP_FILE}.sha256"
```

Copy the dump/checksum to approved encrypted off-host storage and complete a
restore drill. A VPS-only backup is not a deployment gate.

## 4. Build only the reviewed checkout

```bash
node backend/scripts/check-erp-v2-phase1-migration-safety.mjs
node backend/scripts/check-erp-v2-release-artifacts.mjs
git ls-files --error-unmatch backend/prisma/migrations/20260829050000_erp_v2_phase5_shipping_customs/migration.sql
git ls-files --error-unmatch backend/scripts/erp-v2-authenticated-readonly-smoke.mjs
dc build migrate backend frontend
dc images migrate backend frontend
```

Record commit SHA and image IDs in the change record. Never use `prisma migrate
dev`, `prisma migrate reset`, a seed, or a destructive down migration.

## 5. Apply committed migrations, then restart in order

```bash
dc up -d postgres redis
dc exec -T postgres sh -ceu 'pg_isready --username="$POSTGRES_USER" --dbname=auto_import'
dc run --rm migrate npx prisma migrate deploy --schema prisma/schema.prisma
dc run --rm migrate npx prisma migrate status --schema prisma/schema.prisma

dc up -d --no-deps --force-recreate backend
for attempt in $(seq 1 30); do
  test "$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q backend)")" = healthy && break
  test "$attempt" -lt 30 || { echo 'STOP: backend unhealthy' >&2; exit 1; }
  sleep 2
done

dc up -d --no-deps --force-recreate frontend
for attempt in $(seq 1 30); do
  test "$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q frontend)")" = healthy && break
  test "$attempt" -lt 30 || { echo 'STOP: frontend unhealthy' >&2; exit 1; }
  sleep 2
done

dc up -d --no-deps --force-recreate nginx
dc ps
dc logs --since=15m --no-color migrate backend frontend nginx
```

Check the approved hostname without verbose authenticated output:

```bash
curl --fail --silent --show-error https://STAGING_HOST/health > /dev/null
curl --fail --silent --show-error https://STAGING_HOST/ping > /dev/null
curl --fail --silent --show-error https://STAGING_HOST/connexion > /dev/null
```

## 6. Post-migration reconciliation

```bash
POST_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
for report in \
  backend/scripts/erp-v2-phase1-crm-reconciliation-readonly.sql \
  backend/scripts/erp-v2-phase1-migration-verify-readonly.sql \
  backend/scripts/erp-v2-phase2-ged-reconciliation-readonly.sql \
  backend/scripts/erp-v2-phase3-suppliers-offers-reconciliation-readonly.sql \
  backend/scripts/erp-v2-phase4-finance-reconciliation-readonly.sql \
  backend/scripts/erp-v2-phase5-logistics-reconciliation-readonly.sql
do
  name="$(basename "$report" .sql)"
  dc exec -T postgres sh -ceu \
    'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
    < "$report" | tee "erp-v2-reports/${POST_UTC}-${name}.txt"
done
```

Zero is required for source loss, cross-tenant links, checksum corruption,
canonical V2 duplicates, contract schedule/snapshot mismatches and duplicate
ledger projections. Non-zero explicit reconciliation markers require approved
operator tickets before enabling the corresponding V2 write switch.

## 7. Credential-safe authenticated smoke tests

Read credentials without echo and pass them by environment-variable name:

```bash
read -r -p 'Staging administrator email: ' ERP_V2_SMOKE_ADMIN_EMAIL
read -r -s -p 'Staging administrator password: ' ERP_V2_SMOKE_ADMIN_PASSWORD
printf '\n'
export ERP_V2_SMOKE_ADMIN_EMAIL ERP_V2_SMOKE_ADMIN_PASSWORD
export ERP_V2_SMOKE_BASE_URL='http://127.0.0.1:3000/api'
export ERP_V2_SMOKE_CONFIRM='RUN_ERP_V2_READONLY_SMOKE'

dc exec -T \
  -e ERP_V2_SMOKE_ADMIN_EMAIL \
  -e ERP_V2_SMOKE_ADMIN_PASSWORD \
  -e ERP_V2_SMOKE_BASE_URL \
  -e ERP_V2_SMOKE_CONFIRM \
  backend npm run smoke:erp-v2:readonly

unset ERP_V2_SMOKE_ADMIN_EMAIL ERP_V2_SMOKE_ADMIN_PASSWORD
unset ERP_V2_SMOKE_BASE_URL ERP_V2_SMOKE_CONFIRM
```

Then run the Phase 1 mutating synthetic smoke from
`docs/erp-v2-phase-1-linux-staging-runbook.md` only in the dedicated staging
tenants. Expected output from both scripts is a redacted JSON `PASS`; neither
script prints tokens, passwords, identity values, document contents or bank
details.

Manual smoke cases: sensitive GED metadata/preview/download denial, supplier
bank reveal denial/audit, offer revision and assignment replay, contract
deposit/multiple payment/balance, finance source idempotency and reversal,
treasury balance, multi-vehicle arrival automation, ambiguous customs proposal,
port-exit delivery task, and cross-tenant 404 behavior.

## 8. Application rollback

All V2 migrations are additive. Prefer an application rollback while leaving
the expanded schema installed:

```bash
test -s erp-v2-previous-app-commit.txt
PREVIOUS_APP_COMMIT="$(cat erp-v2-previous-app-commit.txt)"
dc stop nginx frontend backend
test -z "$(git status --porcelain)"
git switch --detach "$PREVIOUS_APP_COMMIT"
dc config --quiet
dc build backend frontend
dc up -d --no-deps --force-recreate backend
dc up -d --no-deps --force-recreate frontend
dc up -d --no-deps --force-recreate nginx
dc ps
```

Do not remove V2 tables/columns or reverse migrations after V2 writes occur.

## 9. Restore into a new database only

Never overwrite or drop `auto_import`:

```bash
test -n "${BACKUP_FILE:-}"
test -s "$BACKUP_FILE"
sha256sum --check "${BACKUP_FILE}.sha256"
RESTORE_DB="auto_import_restore_$(date -u +%Y%m%dT%H%M%SZ)"
case "$RESTORE_DB" in auto_import_restore_[0-9T-Z]*) ;; *) exit 1 ;; esac
dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu \
  'createdb --username="$POSTGRES_USER" "$RESTORE_DB"'
dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu \
  'exec pg_restore --username="$POSTGRES_USER" --dbname="$RESTORE_DB" --exit-on-error --no-owner --no-acl' \
  < "$BACKUP_FILE"
dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu \
  'psql --username="$POSTGRES_USER" --dbname="$RESTORE_DB" -X -v ON_ERROR_STOP=1 -Atqc "select current_database(), count(*) from \"Organization\" group by 1"'
```

After review, use `sudoedit .env.staging` to change only the database name in
the secret URL, run `dc config --quiet`, and recreate backend/frontend/nginx.
Keep the original database untouched for investigation.
