-- ERP V2 Phase 2 GED preflight. Read-only and safe for an operator-controlled replica.
BEGIN TRANSACTION READ ONLY;

SELECT 'file_assets' AS metric, count(*)::bigint AS value FROM "FileAsset"
UNION ALL SELECT 'legacy_dossier_documents', count(*) FROM "DossierDocumentAsset"
UNION ALL SELECT 'orphan_file_assets', count(*) FROM "FileAsset" asset
  WHERE NOT EXISTS (SELECT 1 FROM "DossierDocumentAsset" legacy WHERE legacy."fileId" = asset."id")
    AND NOT EXISTS (SELECT 1 FROM "VehiclePhoto" photo WHERE photo."fileId" = asset."id")
    AND NOT EXISTS (SELECT 1 FROM "CustomsDocument" customs WHERE customs."fileId" = asset."id")
    AND NOT EXISTS (SELECT 1 FROM "BusinessDocument" business WHERE business."fileId" = asset."id")
    AND NOT EXISTS (SELECT 1 FROM "DossierCheckpointEvidence" evidence WHERE evidence."fileId" = asset."id")
UNION ALL SELECT 'missing_checksums', count(*) FROM "FileAsset" WHERE length(coalesce("checksum", '')) <> 64
UNION ALL SELECT 'unsafe_url_storage_keys', count(*) FROM "FileAsset" WHERE "storageKey" ~* '^https?://'
UNION ALL SELECT 'legacy_missing_tenant', count(*) FROM "DossierDocumentAsset" WHERE "organizationId" IS NULL
UNION ALL SELECT 'legacy_missing_file_relation', count(*) FROM "DossierDocumentAsset" legacy
  WHERE NOT EXISTS (SELECT 1 FROM "FileAsset" asset WHERE asset."id" = legacy."fileId")
UNION ALL SELECT 'cross_tenant_file_links', count(*) FROM "DossierDocumentAsset" legacy
  JOIN "FileAsset" asset ON asset."id" = legacy."fileId"
  WHERE asset."organizationId" <> legacy."organizationId"
UNION ALL SELECT 'duplicate_legacy_file_links', count(*) FROM (
  SELECT "organizationId", "fileId", "dossierId", "clientId", count(*)
  FROM "DossierDocumentAsset"
  GROUP BY "organizationId", "fileId", "dossierId", "clientId"
  HAVING count(*) > 1
) duplicates
ORDER BY metric;

-- Counts only: filenames, keys, document contents and identities are never emitted.
ROLLBACK;
