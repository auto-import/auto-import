BEGIN;

-- Existing freight amounts remain intact; unknown historical rates stay null.
ALTER TABLE "Shipment" ADD COLUMN "freightExchangeRateId" TEXT,
  ADD COLUMN "freightExchangeRateSnapshot" DECIMAL(18,8),
  ADD COLUMN "freightAmountDzd" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_freightExchangeRateId_fkey"
  FOREIGN KEY ("freightExchangeRateId") REFERENCES "ExchangeRate"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vehicle" ADD COLUMN "sourceOfferVehicleId" TEXT;
CREATE INDEX "Vehicle_sourceOfferVehicleId_idx" ON "Vehicle"("sourceOfferVehicleId");
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_sourceOfferVehicleId_fkey"
  FOREIGN KEY ("sourceOfferVehicleId") REFERENCES "ChinaOfferVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the identity of vehicles already materialized by supplier purchasing.
UPDATE "Vehicle" v SET "sourceOfferVehicleId" = p."sourceOfferVehicleId"
FROM "Purchase" p JOIN "ChinaOfferVehicle" s ON s.id = p."sourceOfferVehicleId"
WHERE p."vehicleId" = v.id AND p."organizationId" = v."organizationId"
  AND s."organizationId" = v."organizationId" AND p."sourceOfferVehicleId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Purchase" other WHERE other."vehicleId" = v.id
    AND other."sourceOfferVehicleId" IS NOT NULL AND other."sourceOfferVehicleId" <> p."sourceOfferVehicleId");

-- Repair existing active catalogue dossiers. Never fabricate a VIN or a purchase.
-- Ambiguous VIN ownership stops the transaction with an actionable diagnostic.
DO $$
DECLARE row RECORD; vehicle_id TEXT; vehicle_status TEXT;
BEGIN
  FOR row IN
    SELECT d.id AS dossier_id, d.status AS dossier_status, d."organizationId" AS org,
      d."openedAt", s.*, o."supplierId"
    FROM "Dossier" d JOIN "CatalogueItem" c ON c.id = d."catalogueItemId"
      JOIN "ChinaOfferVehicle" s ON s.id = c."sourceOfferVehicleId"
      JOIN "ChinaOffer" o ON o.id = s."offerId"
    WHERE d."archivedAt" IS NULL AND d.status NOT IN ('closed','serviceCompleted','cancelled')
      AND c."organizationId" = d."organizationId" AND s."organizationId" = d."organizationId"
      AND o."organizationId" = d."organizationId"
      AND NOT EXISTS (SELECT 1 FROM "DossierVehicle" dv WHERE dv."dossierId" = d.id)
    ORDER BY d."openedAt", d.id
  LOOP
    vehicle_id := NULL;
    SELECT p."vehicleId" INTO vehicle_id FROM "Purchase" p
      JOIN "Vehicle" v ON v.id = p."vehicleId"
      WHERE p."dossierId" = row.dossier_id AND v."organizationId" = row.org
      ORDER BY p."createdAt" LIMIT 1;
    IF vehicle_id IS NULL AND row.vin IS NOT NULL THEN
      SELECT id INTO vehicle_id FROM "Vehicle" WHERE vin = row.vin;
      IF vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Vehicle" WHERE id = vehicle_id AND "organizationId" = row.org) THEN
        RAISE EXCEPTION 'Catalogue dossier %: VIN belongs to another organization; reconcile ownership before migration', row.dossier_id;
      END IF;
    END IF;
    IF vehicle_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM "DossierVehicle" dv JOIN "Dossier" d ON d.id = dv."dossierId"
      WHERE dv."vehicleId" = vehicle_id AND d.id <> row.dossier_id
        AND d."archivedAt" IS NULL AND d.status NOT IN ('closed','serviceCompleted','cancelled')
    ) THEN
      RAISE EXCEPTION 'Catalogue dossier %: vehicle % already assigned; reconcile relationship before migration', row.dossier_id, vehicle_id;
    END IF;
    vehicle_status := CASE
      WHEN row.dossier_status IN ('loading','inTransit','arrivedAtPort') THEN 'inTransit'
      WHEN row.dossier_status IN ('customsClearance') THEN 'inCustoms'
      ELSE 'reserved' END;
    IF vehicle_id IS NULL THEN
      vehicle_id := gen_random_uuid()::text;
      INSERT INTO "Vehicle" (id,"organizationId","sourceOfferVehicleId",vin,brand,model,trim,year,mileage,condition,currency,"acquisitionType","supplierId",status,"createdAt","updatedAt")
      VALUES (vehicle_id,row.org,row.id,row.vin,row.brand,row.model,row.version,row.year,row.mileage,row.condition,row.currency,'chinaOffer',row."supplierId",vehicle_status,row."openedAt",NOW());
      INSERT INTO "VehicleSpec" (id,"vehicleId",engine,"fuelType",transmission,color,description)
      VALUES (gen_random_uuid()::text,vehicle_id,row.specification->>'engine',row.specification->>'fuelType',row.specification->>'transmission',row.specification->>'color',row.specification->>'description');
      INSERT INTO "VehiclePhoto" (id,"vehicleId","fileId","sortOrder","isPrimary","createdAt")
      SELECT gen_random_uuid()::text,vehicle_id,"fileId","sortOrder","isPrimary",NOW() FROM "OfferPhoto" WHERE "offerId" = row."offerId";
    ELSE
      UPDATE "Vehicle" SET "sourceOfferVehicleId" = row.id,
        status = CASE WHEN status = 'available' THEN vehicle_status ELSE status END,
        "updatedAt" = NOW() WHERE id = vehicle_id;
    END IF;
    INSERT INTO "DossierVehicle" (id,"dossierId","vehicleId","assignedAt")
      VALUES (gen_random_uuid()::text,row.dossier_id,vehicle_id,row."openedAt");
  END LOOP;
END $$;

-- Enforce membership for new bookings at the database boundary too. NOT VALID
-- preserves historical data; existing invalid bookings remain visible for review.
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_id_vehicleBookingVehicleId_fkey"
  FOREIGN KEY (id,"vehicleBookingVehicleId") REFERENCES "DossierVehicle"("dossierId","vehicleId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

COMMIT;
