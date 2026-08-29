BEGIN TRANSACTION READ ONLY;

SELECT 'suppliers_without_v2_status' metric, count(*)::bigint value FROM "Partner" WHERE "type" = 'supplier' AND "supplierStatus" IS NULL
UNION ALL SELECT 'offers_without_v2_status', count(*) FROM "ChinaOffer" WHERE "offerStatus" IS NULL
UNION ALL SELECT 'offers_without_supplier_price', count(*) FROM "ChinaOffer" WHERE "supplierPrice" IS NULL
UNION ALL SELECT 'offers_without_revision', count(*) FROM "ChinaOffer" WHERE "currentRevisionId" IS NULL
UNION ALL SELECT 'revision_price_mismatch', count(*) FROM "ChinaOffer" offer JOIN "ChinaOfferRevision" revision ON revision."id" = offer."currentRevisionId" WHERE revision."supplierPrice" <> offer."supplierPrice" OR revision."currency" <> offer."currency"
UNION ALL SELECT 'purchase_source_missing', count(*) FROM "Purchase" WHERE "offerReservationId" IS NOT NULL AND "sourceOfferId" IS NULL
UNION ALL SELECT 'cross_tenant_supplier_dossier', count(*) FROM "SupplierDossierLink" link JOIN "Partner" supplier ON supplier."id" = link."supplierId" JOIN "Dossier" dossier ON dossier."id" = link."dossierId" WHERE link."organizationId" <> supplier."organizationId" OR link."organizationId" <> dossier."organizationId"
ORDER BY metric;

ROLLBACK;
