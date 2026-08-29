# ERP V2 Phase 1 — Linux staging release runbook

This runbook is for the Ubuntu VPS staging stack only. It uses `.env.staging`,
`docker-compose.staging.yml`, and PostgreSQL database `auto_import`. It does not
authorize deployment by an automated agent. A human operator must execute every
command after change approval.

Phase 1 is expansion-first. It does not merge people, delete business rows,
remove legacy CRM columns, run seeds, or introduce a second document authority.
`Prospect.crmStatus`, `ContactPoint`, `ProspectConversion`, and
`CrmReferenceValue` are the V2 authorities. Legacy status/source fields remain
rollback projections.

## 1. Shell setup and immutable release evidence

Run from the repository root on the VPS. Do not source `.env.staging` into the
interactive shell and do not run `docker compose config` without `--quiet`, as
rendered configuration can contain secrets.

```bash
set -euo pipefail
umask 077

test -f .env.staging
test -f docker-compose.staging.yml
test "$(stat -c '%a' .env.staging)" = 600

git rev-parse --verify HEAD
git status --short
git diff --check
test -z "$(git status --porcelain)" || {
  echo 'STOP: the deployment checkout is dirty' >&2
  exit 1
}

RELEASE_COMMIT="$(git rev-parse HEAD)"
read -r -p 'Previously deployed reviewed commit SHA: ' PREVIOUS_APP_COMMIT
git cat-file -e "${PREVIOUS_APP_COMMIT}^{commit}"
printf '%s\n' "$PREVIOUS_APP_COMMIT" > phase1-previous-app-commit.txt
printf '%s\n' "$RELEASE_COMMIT" > phase1-release-commit.txt

dc() {
  docker compose --env-file .env.staging -f docker-compose.staging.yml "$@"
}

dc config --quiet
dc ps
```

The Compose configuration must contain `postgres`, `migrate`, `backend`,
`frontend`, and `nginx`. `redis` remains an internal dependency. Confirm the
database without displaying `DATABASE_URL`:

```bash
dc up -d postgres
dc exec -T postgres sh -ceu \
  'pg_isready --username="$POSTGRES_USER" --dbname=auto_import'
test "$(dc exec -T postgres sh -ceu \
  'psql --username="$POSTGRES_USER" --dbname=auto_import -X -Atqc "select current_database()"')" \
  = auto_import
```

## 2. Read-only preflight before migration

```bash
install -d -m 700 phase1-reports
REPORT_UTC="$(date -u +%Y%m%dT%H%M%SZ)"

dc exec -T postgres sh -ceu \
  'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
  < backend/scripts/erp-v2-preflight-readonly.sql \
  | tee "phase1-reports/${REPORT_UTC}-preflight.txt"

dc run --rm migrate \
  npx prisma migrate status --schema prisma/schema.prisma
```

Stop if the report shows cross-tenant ownership, broken conversion lineage,
invalid contact ownership, or phone collisions without an approved
reconciliation disposition. Never edit or merge records automatically.

## 3. Final logical backup through Docker Compose

Pause application writes before the final backup:

```bash
dc stop nginx frontend backend

install -d -m 700 backups
BACKUP_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="backups/auto_import-pre-phase1-${BACKUP_UTC}.dump"

dc exec -T postgres sh -ceu \
  'exec pg_dump --username="$POSTGRES_USER" --dbname=auto_import \
    --format=custom --no-owner --no-acl' \
  > "$BACKUP_FILE"

test -s "$BACKUP_FILE"
dc exec -T postgres sh -ceu 'exec pg_restore --list' \
  < "$BACKUP_FILE" > /dev/null
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
sha256sum --check "${BACKUP_FILE}.sha256"
chmod 600 "$BACKUP_FILE" "${BACKUP_FILE}.sha256"
```

Copy the dump and checksum to approved encrypted off-host storage and perform a
restore drill before approving the migration. A backup existing only on the VPS
is not sufficient.

## 4. Build the reviewed Docker artifacts

The build context is the repository root. The backend image copies the shared
contracts, compiles all Nest runtime modules, retains Prisma migrations in the
`migrate` target, and includes the authenticated Phase 1 smoke script in the
runtime image. The frontend image copies the shared contracts before producing
the standalone Next.js artifact.

```bash
node backend/scripts/check-erp-v2-phase1-migration-safety.mjs
git ls-files --error-unmatch \
  backend/prisma/migrations/20260829010000_erp_v2_phase1_crm_clients/migration.sql
git ls-files --error-unmatch \
  backend/scripts/erp-v2-phase1-authenticated-smoke.mjs

dc build migrate backend frontend

dc images migrate
dc images backend
dc images frontend
```

Record image IDs in the change ticket. Do not use an unreviewed checkout and do
not run `prisma migrate dev`, `prisma migrate reset`, or any seed command.

## 5. Apply only committed migrations

PostgreSQL must be healthy and application writes must still be paused.

```bash
dc up -d postgres redis
dc exec -T postgres sh -ceu \
  'pg_isready --username="$POSTGRES_USER" --dbname=auto_import'

dc run --rm migrate \
  npx prisma migrate deploy --schema prisma/schema.prisma

dc run --rm migrate \
  npx prisma migrate status --schema prisma/schema.prisma
```

The one-shot `migrate` container must exit zero before any new application
container starts.

## 6. Restart in dependency order

```bash
dc up -d --no-deps --force-recreate backend

for attempt in $(seq 1 30); do
  test "$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q backend)")" = healthy \
    && break
  test "$attempt" -lt 30 || {
    echo 'STOP: backend did not become healthy' >&2
    exit 1
  }
  sleep 2
done

dc up -d --no-deps --force-recreate frontend
for attempt in $(seq 1 30); do
  test "$(docker inspect --format '{{.State.Health.Status}}' "$(dc ps -q frontend)")" = healthy \
    && break
  test "$attempt" -lt 30 || {
    echo 'STOP: frontend did not become healthy' >&2
    exit 1
  }
  sleep 2
done

dc up -d --no-deps --force-recreate nginx
```

## 7. Health and log checks

```bash
dc ps
dc exec -T postgres sh -ceu \
  'pg_isready --username="$POSTGRES_USER" --dbname=auto_import'

docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$(dc ps -q backend)"
docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$(dc ps -q frontend)"
docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' "$(dc ps -q nginx)"

dc logs --since=15m --no-color migrate backend frontend nginx

curl --fail --silent --show-error https://STAGING_HOST/health > /dev/null
curl --fail --silent --show-error https://STAGING_HOST/ping > /dev/null
curl --fail --silent --show-error https://STAGING_HOST/connexion > /dev/null
```

Replace `STAGING_HOST` with the approved public hostname. Do not use `curl -v`
with authenticated requests because verbose output can expose headers.

## 8. Post-migration reconciliation

All three commands below are read-only:

```bash
POST_REPORT_UTC="$(date -u +%Y%m%dT%H%M%SZ)"

dc exec -T postgres sh -ceu \
  'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
  < backend/scripts/erp-v2-preflight-readonly.sql \
  | tee "phase1-reports/${POST_REPORT_UTC}-preflight-post.txt"

dc exec -T postgres sh -ceu \
  'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
  < backend/scripts/erp-v2-phase1-crm-reconciliation-readonly.sql \
  | tee "phase1-reports/${POST_REPORT_UTC}-crm-reconciliation.txt"

dc exec -T postgres sh -ceu \
  'exec psql --username="$POSTGRES_USER" --dbname=auto_import -X -v ON_ERROR_STOP=1' \
  < backend/scripts/erp-v2-phase1-migration-verify-readonly.sql \
  | tee "phase1-reports/${POST_REPORT_UTC}-migration-verify.txt"
```

`source_loss` must be zero. Ambiguous phone fingerprints may remain only when
each group has an approved operator reconciliation ticket. The migration must
report zero unique indexes on Lead/Client phone projection columns.

## 9. Authenticated Phase 1 smoke test

Use a staging Administrator, a staging user that has `clients:read` but neither
identity reveal nor identity write permission, and the ID of a Client belonging
to a separate dedicated test tenant. Passwords are read without terminal echo,
passed by environment-variable name rather than command-line value, never
printed by the script, and cleared afterward.

```bash
read -r -p 'Staging administrator email: ' PHASE1_SMOKE_ADMIN_EMAIL
read -r -s -p 'Staging administrator password: ' PHASE1_SMOKE_ADMIN_PASSWORD
printf '\n'
read -r -p 'Restricted staging user email: ' PHASE1_SMOKE_RESTRICTED_EMAIL
read -r -s -p 'Restricted staging user password: ' PHASE1_SMOKE_RESTRICTED_PASSWORD
printf '\n'
read -r -p 'Cross-tenant test Client ID: ' PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID

export PHASE1_SMOKE_ADMIN_EMAIL PHASE1_SMOKE_ADMIN_PASSWORD
export PHASE1_SMOKE_RESTRICTED_EMAIL PHASE1_SMOKE_RESTRICTED_PASSWORD
export PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID
export PHASE1_SMOKE_BASE_URL='http://127.0.0.1:3000/api'
export PHASE1_SMOKE_CONFIRM='RUN_PHASE1_STAGING_SMOKE'

dc exec -T \
  -e PHASE1_SMOKE_ADMIN_EMAIL \
  -e PHASE1_SMOKE_ADMIN_PASSWORD \
  -e PHASE1_SMOKE_RESTRICTED_EMAIL \
  -e PHASE1_SMOKE_RESTRICTED_PASSWORD \
  -e PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID \
  -e PHASE1_SMOKE_BASE_URL \
  -e PHASE1_SMOKE_CONFIRM \
  backend npm run smoke:phase1

unset PHASE1_SMOKE_ADMIN_EMAIL PHASE1_SMOKE_ADMIN_PASSWORD
unset PHASE1_SMOKE_RESTRICTED_EMAIL PHASE1_SMOKE_RESTRICTED_PASSWORD
unset PHASE1_SMOKE_CROSS_TENANT_CLIENT_ID PHASE1_SMOKE_BASE_URL
unset PHASE1_SMOKE_CONFIRM
```

Expected output is one redacted JSON object with `"status":"PASS"`. The script
creates synthetic staging records, verifies concurrent Lead creation and
conversion, checks tabs/isolation/masking, and archives the resulting Client.
It never prints tokens, passwords, the synthetic NIN, or response bodies.

## 10. Application rollback

The Phase 1 schema is additive and legacy projections remain populated. Prefer
an application rollback while leaving the migration installed.

```bash
test -s phase1-previous-app-commit.txt
PREVIOUS_APP_COMMIT="$(cat phase1-previous-app-commit.txt)"

dc stop nginx frontend backend
git status --short
test -z "$(git status --porcelain)"
git switch --detach "$PREVIOUS_APP_COMMIT"

dc config --quiet
dc build backend frontend
dc up -d --no-deps --force-recreate backend
dc up -d --no-deps --force-recreate frontend
dc up -d --no-deps --force-recreate nginx
dc ps
```

Do not run a down migration and do not remove Phase 1 tables, columns, indexes,
or conversion history after V2 writes have occurred.

## 11. Restore into a new database

Use this only when application rollback is insufficient. It never drops or
overwrites `auto_import`.

```bash
test -n "${BACKUP_FILE:-}"
test -s "$BACKUP_FILE"
sha256sum --check "${BACKUP_FILE}.sha256"

RESTORE_DB="auto_import_restore_$(date -u +%Y%m%dT%H%M%SZ)"
case "$RESTORE_DB" in
  auto_import_restore_[0-9T-Z]*) ;;
  *) echo 'Unsafe restore database name' >&2; exit 1 ;;
esac

dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu '
  createdb --username="$POSTGRES_USER" "$RESTORE_DB"
'

dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu '
  exec pg_restore --username="$POSTGRES_USER" --dbname="$RESTORE_DB" \
    --exit-on-error --no-owner --no-acl
' < "$BACKUP_FILE"

dc exec -T -e RESTORE_DB="$RESTORE_DB" postgres sh -ceu '
  psql --username="$POSTGRES_USER" --dbname="$RESTORE_DB" -X -v ON_ERROR_STOP=1 \
    -Atqc "select current_database(), count(*) from \"Organization\" group by 1"
'
```

After validation, use `sudoedit .env.staging` to change only the database name
inside the secret `DATABASE_URL` to the new restore database. Do not echo or use
`sed` on the URL. Then run `dc config --quiet`, rebuild the reviewed rollback
application if necessary, and recreate `backend`, `frontend`, and `nginx` in
that order. Keep the original database untouched for investigation.

## 12. Release gates

Deployment is blocked unless:

- the checkout and reviewed image provenance are clean;
- the backup and restore drill pass;
- fresh and representative migrations pass;
- authenticated API concurrency passes without 409/500 or database error text;
- `source_loss` is zero;
- every production ambiguous phone group has an approved disposition;
- cross-tenant and restricted-identity tests pass;
- post-deployment services are healthy and the authenticated smoke reports PASS.

Phase 2 must reuse existing `FileAsset` and `DossierDocumentAsset` records. It
must not introduce another physical file authority.
