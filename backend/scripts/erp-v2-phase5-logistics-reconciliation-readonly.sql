BEGIN TRANSACTION READ ONLY;

SELECT 'customs_reconciliation_required' AS metric, count(*)::bigint AS value FROM "CustomsFile" WHERE "reconciliationRequired"
UNION ALL SELECT 'v2_customs_missing_responsible', count(*)::bigint FROM "CustomsFile" WHERE "v2Status" IS NOT NULL AND "responsibleUserId" IS NULL
UNION ALL SELECT 'v2_customs_missing_snapshot', count(*)::bigint FROM "CustomsFile" WHERE "v2Status" IS NOT NULL AND ("containerSnapshot" IS NULL OR "blSnapshot" IS NULL OR "arrivalPortSnapshot" IS NULL)
UNION ALL SELECT 'duplicate_v2_vehicle_dossier', count(*)::bigint FROM (
  SELECT "organizationId","vehicleId","dossierId" FROM "CustomsFile" WHERE "v2Status" IS NOT NULL GROUP BY "organizationId","vehicleId","dossierId" HAVING count(*) > 1
) duplicate
UNION ALL SELECT 'shipment_vehicle_without_customs_after_arrival', count(*)::bigint
FROM "ShipmentVehicle" link JOIN "Shipment" shipment ON shipment.id = link."shipmentId"
WHERE shipment.status = 'arrived' AND NOT EXISTS (
  SELECT 1 FROM "CustomsFile" customs WHERE customs."shipmentId" = shipment.id AND customs."vehicleId" = link."vehicleId" AND customs."v2Status" IS NOT NULL
);

ROLLBACK;
