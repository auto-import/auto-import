BEGIN TRANSACTION READ ONLY;

SELECT 'suppliers' metric, count(*)::bigint value FROM "Partner" WHERE "type" = 'supplier'
UNION ALL SELECT 'unknown_supplier_status', count(*) FROM "Partner" WHERE "type" = 'supplier' AND lower("status") NOT IN ('active','inactive','archived')
UNION ALL SELECT 'offers', count(*) FROM "ChinaOffer"
UNION ALL SELECT 'offers_without_supplier_price', count(*) FROM "ChinaOffer" WHERE coalesce("purchasePrice", "cifPrice") IS NULL
UNION ALL SELECT 'offers_unknown_legacy_status', count(*) FROM "ChinaOffer" WHERE lower("status") NOT IN ('available','active','validated','reserved','rejected','archived','under_verification','under verification','expired','upcoming','sold')
UNION ALL SELECT 'cross_tenant_offers', count(*) FROM "ChinaOffer" offer JOIN "Partner" supplier ON supplier."id" = offer."supplierId" WHERE supplier."organizationId" <> offer."organizationId"
UNION ALL SELECT 'duplicate_dossier_offer_assignments', count(*) FROM (
  SELECT "dossierId" FROM "OfferReservation" WHERE "dossierId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1
) duplicates
ORDER BY metric;

ROLLBACK;
