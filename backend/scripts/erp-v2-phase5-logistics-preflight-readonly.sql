BEGIN TRANSACTION READ ONLY;

SELECT 'customs_missing_vehicle' AS metric, count(*)::bigint AS value FROM "CustomsFile" WHERE "vehicleId" IS NULL
UNION ALL SELECT 'customs_missing_dossier', count(*)::bigint FROM "CustomsFile" WHERE "dossierId" IS NULL
UNION ALL SELECT 'customs_missing_shipment', count(*)::bigint FROM "CustomsFile" WHERE "shipmentId" IS NULL
UNION ALL SELECT 'duplicate_vehicle_dossier', count(*)::bigint FROM (
  SELECT "organizationId","vehicleId","dossierId" FROM "CustomsFile"
  WHERE "vehicleId" IS NOT NULL AND "dossierId" IS NOT NULL
  GROUP BY "organizationId","vehicleId","dossierId" HAVING count(*) > 1
) duplicate
UNION ALL SELECT 'cross_tenant_customs_links', count(*)::bigint
FROM "CustomsFile" customs
LEFT JOIN "Shipment" shipment ON shipment.id = customs."shipmentId"
LEFT JOIN "Vehicle" vehicle ON vehicle.id = customs."vehicleId"
LEFT JOIN "Dossier" dossier ON dossier.id = customs."dossierId"
WHERE (shipment.id IS NOT NULL AND shipment."organizationId" <> customs."organizationId")
   OR (vehicle.id IS NOT NULL AND vehicle."organizationId" <> customs."organizationId")
   OR (dossier.id IS NOT NULL AND dossier."organizationId" <> customs."organizationId");

ROLLBACK;
