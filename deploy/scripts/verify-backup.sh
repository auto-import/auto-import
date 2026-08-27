#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_dir="${1:-}"
[[ "$backup_dir" = /* && "$backup_dir" == */backup-* && -d "$backup_dir" ]] || {
  printf 'Usage: %s /absolute/path/backup-YYYYmmddTHHMMSSZ\n' "$0" >&2; exit 2;
}
for file in database.dump documents.tar.gz documents.sha256 manifest.json checksums.sha256; do
  [[ -f "$backup_dir/$file.gpg" ]] || { printf 'ERROR missing encrypted artifact %s\n' "$file" >&2; exit 2; }
done
stage="$(mktemp -d)"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT
for file in database.dump documents.tar.gz documents.sha256 manifest.json checksums.sha256; do
  gpg --batch --quiet --output "$stage/$file" --decrypt "$backup_dir/$file.gpg"
done
(
  cd "$stage"
  sha256sum --check checksums.sha256
  pg_restore --list database.dump >/dev/null
  tar --list --gzip --file=documents.tar.gz >/dev/null
)
printf 'Backup verification passed: %s\n' "$backup_dir"
