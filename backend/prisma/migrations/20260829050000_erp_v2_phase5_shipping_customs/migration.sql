-- ERP V2 Phase 5: additive maritime/customs workflow projections.
-- Duplicate or incomplete historical customs rows remain explicit reconciliation items.

ALTER TABLE "CustomsFile"
  ADD COLUMN "responsibleUserId" TEXT,
  ADD COLUMN "v2Status" TEXT,
  ADD COLUMN "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "containerSnapshot" TEXT,
  ADD COLUMN "blSnapshot" TEXT,
  ADD COLUMN "arrivalPortSnapshot" TEXT,
  ADD COLUMN "portExitAt" TIMESTAMP(3);

ALTER TABLE "CustomsFile"
  ADD CONSTRAINT "CustomsFile_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "CustomsFile" customs
SET
  "containerSnapshot" = shipment."containerNumber",
  "blSnapshot" = shipment."blNumber",
  "arrivalPortSnapshot" = shipment."arrivalPort"
FROM "Shipment" shipment
WHERE shipment.id = customs."shipmentId";

WITH duplicate_scope AS (
  SELECT "organizationId", "vehicleId", "dossierId", count(*) AS total
  FROM "CustomsFile"
  WHERE "vehicleId" IS NOT NULL AND "dossierId" IS NOT NULL
  GROUP BY "organizationId", "vehicleId", "dossierId"
), safe_rows AS (
  SELECT customs.id
  FROM "CustomsFile" customs
  JOIN duplicate_scope scope ON scope."organizationId" = customs."organizationId"
    AND scope."vehicleId" = customs."vehicleId" AND scope."dossierId" = customs."dossierId"
  WHERE customs."shipmentId" IS NOT NULL AND scope.total = 1
    AND customs.status IN ('open','inInspection','cleared','released','closed')
)
UPDATE "CustomsFile" customs
SET "v2Status" = CASE customs.status
  WHEN 'open' THEN 'TO_PREPARE'
  WHEN 'inInspection' THEN 'INSPECTION'
  WHEN 'cleared' THEN 'RELEASE'
  WHEN 'released' THEN 'PORT_EXIT'
  WHEN 'closed' THEN 'CLOSED'
END
WHERE customs.id IN (SELECT id FROM safe_rows);

UPDATE "CustomsFile"
SET "reconciliationRequired" = true
WHERE "v2Status" IS NULL;

ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_v2Status_check" CHECK (
  "v2Status" IS NULL OR "v2Status" IN (
    'TO_PREPARE','AWAITING_ARRIVAL','ARRIVED_AT_PORT','FILE_TRANSMITTED',
    'CLEARANCE_IN_PROGRESS','INSPECTION','DUTIES_TAXES','RELEASE','PORT_EXIT','CLOSED'
  )
) NOT VALID;

-- Only reconciled/V2 rows participate, so ambiguous legacy groups cannot fail deployment.
CREATE UNIQUE INDEX "CustomsFile_v2_vehicle_dossier_key"
  ON "CustomsFile"("organizationId","vehicleId","dossierId")
  WHERE "v2Status" IS NOT NULL;
CREATE INDEX "CustomsFile_organizationId_v2Status_openedAt_idx" ON "CustomsFile"("organizationId","v2Status","openedAt");
CREATE INDEX "CustomsFile_responsibleUserId_v2Status_idx" ON "CustomsFile"("responsibleUserId","v2Status");

INSERT INTO "Permission" ("id","resource","action","description") VALUES
  (gen_random_uuid(),'shipments','transition','Transition maritime shipment workflow'),
  (gen_random_uuid(),'customs','transition','Transition customs/transit workflow'),
  (gen_random_uuid(),'customs','automate','Create customs files idempotently from a shipment')
ON CONFLICT ("resource","action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT role_permission."roleId", target.id
FROM "RolePermission" role_permission
JOIN "Permission" current_permission ON current_permission.id = role_permission."permissionId"
JOIN "Permission" target ON
  (current_permission.resource = 'shipments' AND current_permission.action = 'write' AND target.resource = 'shipments' AND target.action = 'transition')
  OR (current_permission.resource = 'customs' AND current_permission.action = 'write' AND target.resource = 'customs' AND target.action IN ('transition','automate'))
ON CONFLICT DO NOTHING;
