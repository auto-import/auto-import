# ERP V2 Phase 2 — GED operational notes

Phase 2 is an additive expand/backfill release. `FileAsset` remains the only physical-byte authority. `GedDocument` owns logical metadata, `GedDocumentVersion` is append-only, and `GedDocumentLink` uses explicit foreign keys. The legacy `DossierDocumentAsset` table remains available through a nullable bridge and is not removed.

## Mandatory reconciliation gate

Run against an approved read-only restored backup before deployment:

```bash
psql "$READ_ONLY_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file=backend/scripts/erp-v2-phase2-ged-preflight-readonly.sql
GED_STORAGE_PREFLIGHT_READONLY=YES READ_ONLY_DATABASE_URL="$READ_ONLY_DATABASE_URL" PRIVATE_STORAGE_ROOT=/app/storage/private node backend/scripts/erp-v2-phase2-storage-preflight.mjs
```

After migration, run:

```bash
psql "$READ_ONLY_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --file=backend/scripts/erp-v2-phase2-ged-reconciliation-readonly.sql
```

Deployment is blocked if cross-tenant relations, invalid link target counts, checksum metadata mismatches, or unexplained count differences are non-zero. Documents without a valid 64-character legacy checksum remain bridged but have no current version; they must be reconciled and integrity-verified, never guessed or silently discarded.

## File security infrastructure

- TLS/HTTPS is required in transit.
- The private storage provider or volume must provide AES-256-equivalent encryption at rest; keys stay in deployment secrets/KMS and never in source, database, frontend, URLs or logs.
- SHA-256 is used only for integrity verification, not encryption.
- A malware-scanning service is a production prerequisite. Until configured, new assets are explicitly marked `NOT_CONFIGURED`; `INFECTED` or integrity-failed assets are quarantined and never served.
- Preview responses use `nosniff`, a sandboxed CSP, private/no-store caching and authenticated backend streaming. No permanent public URL is introduced.

## Rollback

Roll back the application image/commit only. Leave the additive GED tables, columns, links and versions installed. Disable new GED writes if reconciliation diverges, continue read-only investigation, and forward-fix. Do not run a destructive down migration and do not delete legacy or versioned files.
