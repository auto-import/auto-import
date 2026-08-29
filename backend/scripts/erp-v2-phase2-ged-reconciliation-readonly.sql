-- Run after the Phase 2 migration. Counts only; never emits sensitive metadata.
BEGIN TRANSACTION READ ONLY;

SELECT 'legacy_documents' AS metric, count(*)::bigint AS value FROM "DossierDocumentAsset"
UNION ALL SELECT 'legacy_with_ged_bridge', count(*) FROM "DossierDocumentAsset" WHERE "gedDocumentId" IS NOT NULL
UNION ALL SELECT 'ged_documents', count(*) FROM "GedDocument"
UNION ALL SELECT 'ged_versions', count(*) FROM "GedDocumentVersion"
UNION ALL SELECT 'ged_links', count(*) FROM "GedDocumentLink"
UNION ALL SELECT 'ged_without_current_version', count(*) FROM "GedDocument" WHERE "currentVersionId" IS NULL
UNION ALL SELECT 'ged_version_checksum_mismatch_metadata', count(*) FROM "GedDocumentVersion" version
  JOIN "FileAsset" asset ON asset."id" = version."fileId"
  WHERE version."checksum" <> asset."checksum"
UNION ALL SELECT 'cross_tenant_versions', count(*) FROM "GedDocumentVersion" version
  JOIN "GedDocument" document ON document."id" = version."documentId"
  JOIN "FileAsset" asset ON asset."id" = version."fileId"
  WHERE version."organizationId" <> document."organizationId"
    OR asset."organizationId" <> document."organizationId"
UNION ALL SELECT 'cross_tenant_links', count(*) FROM "GedDocumentLink" link
  JOIN "GedDocument" document ON document."id" = link."documentId"
  WHERE link."organizationId" <> document."organizationId"
UNION ALL SELECT 'invalid_link_target_count', count(*) FROM "GedDocumentLink"
  WHERE num_nonnulls("prospectId","clientId","dossierId","vehicleId","supplierId","chinaOfferId","purchaseId","shipmentId","customsFileId","paymentId") <> 1
ORDER BY metric;

ROLLBACK;
