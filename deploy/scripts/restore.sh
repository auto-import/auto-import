#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_dir="${1:-}"
[[ "$backup_dir" = /* && "$backup_dir" == */backup-* && -d "$backup_dir" ]] || {
  printf 'ERROR backup directory must be an absolute backup-* path\n' >&2; exit 2;
}
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${TARGET_STORAGE_ROOT:?TARGET_STORAGE_ROOT is required}"
[[ "$TARGET_STORAGE_ROOT" = /* ]] || { printf 'ERROR target storage must be absolute\n' >&2; exit 2; }
case "$TARGET_STORAGE_ROOT" in /|/app|/srv|/var|/home|/root) printf 'ERROR unsafe target storage path\n' >&2; exit 2;; esac

database_name="$(psql "$TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command='select current_database()')"
expected="RESTORE:${database_name}:${TARGET_STORAGE_ROOT}"
[[ "${RESTORE_CONFIRM:-}" = "$expected" ]] || {
  printf 'ERROR destructive confirmation required: RESTORE:<database-name>:<absolute-storage-path>\n' >&2; exit 2;
}

"$(dirname "$0")/verify-backup.sh" "$backup_dir"
stage="$(mktemp -d)"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT
for file in database.dump documents.tar.gz documents.sha256; do
  gpg --batch --quiet --output "$stage/$file" --decrypt "$backup_dir/$file.gpg"
done

mkdir -p -- "$TARGET_STORAGE_ROOT"
resolved="$(cd "$TARGET_STORAGE_ROOT" && pwd -P)"
[[ "$resolved" = "$TARGET_STORAGE_ROOT" && "$resolved" != "/" ]] || {
  printf 'ERROR target storage resolution is unsafe\n' >&2; exit 2;
}
while IFS= read -r -d '' entry; do rm -rf -- "$entry"; done < <(find "$resolved" -mindepth 1 -maxdepth 1 -print0)
pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists --no-owner --no-privileges --exit-on-error "$stage/database.dump"
tar --extract --gzip --file="$stage/documents.tar.gz" --directory="$resolved" --no-same-owner --no-same-permissions
(
  cd "$resolved"
  sha256sum --check "$stage/documents.sha256"
)
printf 'Restore passed: database=%s document_target=%s\n' "$database_name" "$resolved"
