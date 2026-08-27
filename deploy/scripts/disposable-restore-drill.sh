#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
: "${PRIVATE_STORAGE_ROOT:?PRIVATE_STORAGE_ROOT is required}"
: "${TARGET_STORAGE_ROOT:?TARGET_STORAGE_ROOT is required}"
: "${BACKUP_ROOT:?BACKUP_ROOT is required}"
: "${DRILL_DATABASE_NAME:?DRILL_DATABASE_NAME is required}"
[[ "$DRILL_DATABASE_NAME" =~ ^codex_[a-z0-9_]+$ ]] || {
  printf 'ERROR drill database name must start with codex_\n' >&2; exit 2;
}
[[ "${DRILL_CREATE_GPG_KEY:-}" = "yes" ]] || {
  printf 'ERROR DRILL_CREATE_GPG_KEY=yes is required for a disposable key\n' >&2; exit 2;
}

gpg --batch --passphrase '' --quick-generate-key \
  'Disposable restore drill <restore-drill@example.invalid>' default default 1d >/dev/null
export BACKUP_GPG_RECIPIENT
BACKUP_GPG_RECIPIENT="$(gpg --batch --with-colons --list-keys 'restore-drill@example.invalid' | awk -F: '$1 == "fpr" { print $10; exit }')"
[[ -n "$BACKUP_GPG_RECIPIENT" ]] || { printf 'ERROR disposable GPG key generation failed\n' >&2; exit 2; }

export DATABASE_URL="$SOURCE_DATABASE_URL"
export BACKUP_MAINTENANCE_CONFIRMED=yes
export APPLICATION_VERSION="${APPLICATION_VERSION:-restore-drill}"
"$(dirname "$0")/backup.sh"
backup_dir="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' | sort | tail -n 1)"
[[ -n "$backup_dir" ]] || { printf 'ERROR backup output was not found\n' >&2; exit 2; }
"$(dirname "$0")/verify-backup.sh" "$backup_dir"

dropdb --if-exists --force --maintenance-db="$DATABASE_ADMIN_URL" "$DRILL_DATABASE_NAME"
createdb --maintenance-db="$DATABASE_ADMIN_URL" "$DRILL_DATABASE_NAME"
export RESTORE_CONFIRM="RESTORE:${DRILL_DATABASE_NAME}:${TARGET_STORAGE_ROOT}"
"$(dirname "$0")/restore.sh" "$backup_dir"

source_count="$(psql "$SOURCE_DATABASE_URL" -Atqc 'select count(*) from "OrganizationBrandingLogo"')"
target_count="$(psql "$TARGET_DATABASE_URL" -Atqc 'select count(*) from "OrganizationBrandingLogo"')"
[[ "$source_count" = "$target_count" && "$target_count" -gt 0 ]] || {
  printf 'ERROR branding-row count mismatch after restore\n' >&2; exit 1;
}
printf 'Disposable restore drill passed: branding_rows=%s\n' "$target_count"
