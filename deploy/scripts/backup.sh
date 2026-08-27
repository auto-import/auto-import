#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

require() { [[ -n "${!1:-}" ]] || { printf 'ERROR missing %s\n' "$1" >&2; exit 2; }; }
safe_absolute() {
  [[ "$1" = /* && "$1" != "/" && "$1" != "/app" && "$1" != "/srv" ]] || {
    printf 'ERROR unsafe path for %s\n' "$2" >&2; exit 2;
  }
}
require DATABASE_URL
require PRIVATE_STORAGE_ROOT
require BACKUP_ROOT
require BACKUP_GPG_RECIPIENT
[[ "${BACKUP_MAINTENANCE_CONFIRMED:-}" = "yes" ]] || {
  printf 'ERROR set BACKUP_MAINTENANCE_CONFIRMED=yes after pausing application writes\n' >&2; exit 2;
}
safe_absolute "$PRIVATE_STORAGE_ROOT" PRIVATE_STORAGE_ROOT
safe_absolute "$BACKUP_ROOT" BACKUP_ROOT
[[ -d "$PRIVATE_STORAGE_ROOT" ]] || { printf 'ERROR private storage is absent\n' >&2; exit 2; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
version="${APPLICATION_VERSION:-unknown}"
final_dir="$BACKUP_ROOT/backup-$timestamp"
stage="$BACKUP_ROOT/.staging-$timestamp-$$"
mkdir -p -- "$BACKUP_ROOT" "$stage" "$final_dir"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

printf 'Creating consistent PostgreSQL custom-format dump\n'
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$stage/database.dump"
printf 'Snapshotting private documents during confirmed maintenance window\n'
(
  cd "$PRIVATE_STORAGE_ROOT"
  find . -type f -print0 | sort -z | xargs -0 -r sha256sum > "$stage/documents.sha256"
  tar --create --gzip --file="$stage/documents.tar.gz" .
)

db_bytes="$(wc -c < "$stage/database.dump" | tr -d ' ')"
doc_bytes="$(wc -c < "$stage/documents.tar.gz" | tr -d ' ')"
doc_count="$(wc -l < "$stage/documents.sha256" | tr -d ' ')"
db_hash="$(sha256sum "$stage/database.dump" | cut -d' ' -f1)"
doc_hash="$(sha256sum "$stage/documents.tar.gz" | cut -d' ' -f1)"

printf '{\n  "timestampUtc": "%s",\n  "applicationVersion": "%s",\n  "databaseFormat": "postgres-custom",\n  "databaseBytes": %s,\n  "databaseSha256": "%s",\n  "documentFiles": %s,\n  "documentArchiveBytes": %s,\n  "documentArchiveSha256": "%s"\n}\n' \
  "$timestamp" "$version" "$db_bytes" "$db_hash" "$doc_count" "$doc_bytes" "$doc_hash" > "$stage/manifest.json"
(
  cd "$stage"
  sha256sum database.dump documents.tar.gz documents.sha256 manifest.json > checksums.sha256
)

for file in database.dump documents.tar.gz documents.sha256 manifest.json checksums.sha256; do
  gpg --batch --yes --trust-model always --recipient "$BACKUP_GPG_RECIPIENT" \
    --output "$final_dir/$file.gpg" --encrypt "$stage/$file"
done
chmod 0700 "$final_dir"

if [[ -n "${BACKUP_OFFSITE_COMMAND:-}" ]]; then
  [[ -x "$BACKUP_OFFSITE_COMMAND" ]] || { printf 'ERROR off-site hook is not executable\n' >&2; exit 2; }
  "$BACKUP_OFFSITE_COMMAND" "$final_dir"
fi

retention="${BACKUP_RETENTION_DAYS:-14}"
[[ "$retention" =~ ^[1-9][0-9]*$ ]] || { printf 'ERROR invalid BACKUP_RETENTION_DAYS\n' >&2; exit 2; }
while IFS= read -r -d '' expired; do
  [[ "$expired" == "$BACKUP_ROOT"/backup-* ]] || { printf 'ERROR unsafe retention target\n' >&2; exit 2; }
  rm -rf -- "$expired"
done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -mtime "+$retention" -print0)
printf 'Backup complete: %s (documents=%s)\n' "$final_dir" "$doc_count"
