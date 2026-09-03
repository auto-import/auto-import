-- Additive workflow v2 migration. Existing dossiers remain on workflowVersion=1.
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "workflowVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "forwarderSupplierId" TEXT;
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "vehicleBookingVehicleId" TEXT;
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "vehicleBookingDate" TIMESTAMP(3);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "vehicleBookingNote" TEXT;
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "upgradedFromType" "DossierType";
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "upgradedAt" TIMESTAMP(3);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "cifPrice" DECIMAL(12,2);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "ddpPrice" DECIMAL(12,2);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "priceCurrency" TEXT;
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "priceLockedAt" TIMESTAMP(3);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "dutyOverrideAmount" DECIMAL(12,2);
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "dutyOverrideJustification" TEXT;
ALTER TABLE "Dossier" ALTER COLUMN "workflowVersion" SET DEFAULT 2;

ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "rejectedBy" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "length_cm" DECIMAL(10,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "width_cm" DECIMAL(10,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "height_cm" DECIMAL(10,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "weight_kg" DECIMAL(10,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "brandLookupId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "modelLookupId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "bodyTypeLookupId" TEXT;

ALTER TABLE "VehicleSpec" ADD COLUMN IF NOT EXISTS "engineLookupId" TEXT;
ALTER TABLE "VehicleSpec" ADD COLUMN IF NOT EXISTS "fuelTypeLookupId" TEXT;
ALTER TABLE "VehicleSpec" ADD COLUMN IF NOT EXISTS "transmissionLookupId" TEXT;
ALTER TABLE "VehicleSpec" ADD COLUMN IF NOT EXISTS "colorLookupId" TEXT;

CREATE TABLE IF NOT EXISTS "VehicleLookupValue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "parentId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleLookupValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "VehicleLookupValue_organizationId_kind_normalizedValue_parentId_key" ON "VehicleLookupValue"("organizationId", "kind", "normalizedValue", "parentId");
CREATE INDEX IF NOT EXISTS "VehicleLookupValue_organizationId_kind_active_idx" ON "VehicleLookupValue"("organizationId", "kind", "active");
CREATE INDEX IF NOT EXISTS "VehicleLookupValue_parentId_idx" ON "VehicleLookupValue"("parentId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleLookupValue_organizationId_fkey') THEN
    ALTER TABLE "VehicleLookupValue" ADD CONSTRAINT "VehicleLookupValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VehicleLookupValue_parentId_fkey') THEN
    ALTER TABLE "VehicleLookupValue" ADD CONSTRAINT "VehicleLookupValue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Preserve the exact historical spellings. Case variants are deliberately flagged for review.
INSERT INTO "VehicleLookupValue" ("id", "organizationId", "kind", "value", "normalizedValue", "needsReview")
SELECT gen_random_uuid()::text, v."organizationId", 'BRAND', trim(v."brand"), lower(trim(v."brand")), false
FROM "Vehicle" v WHERE trim(v."brand")<>'' GROUP BY v."organizationId", trim(v."brand")
ON CONFLICT DO NOTHING;
INSERT INTO "VehicleLookupValue" ("id", "organizationId", "kind", "value", "normalizedValue", "parentId", "needsReview")
SELECT gen_random_uuid()::text, v."organizationId", 'MODEL', trim(v."model"), lower(trim(v."model")), b."id", false
FROM "Vehicle" v
JOIN "VehicleLookupValue" b ON b."organizationId"=v."organizationId" AND b."kind"='BRAND' AND b."normalizedValue"=lower(trim(v."brand"))
WHERE trim(v."model")<>'' GROUP BY v."organizationId", trim(v."model"), b."id"
ON CONFLICT DO NOTHING;
UPDATE "VehicleLookupValue" target SET "needsReview"=true
WHERE EXISTS (
  SELECT 1 FROM "VehicleLookupValue" candidate
  WHERE candidate."organizationId"=target."organizationId"
    AND candidate."kind"=target."kind"
    AND candidate."normalizedValue"=target."normalizedValue"
    AND candidate."value"<>target."value"
);
INSERT INTO "VehicleLookupValue" ("id", "organizationId", "kind", "value", "normalizedValue")
SELECT gen_random_uuid()::text, v."organizationId", k.kind, k.value, lower(k.value)
FROM "Vehicle" v JOIN "VehicleSpec" s ON s."vehicleId"=v."id"
CROSS JOIN LATERAL (VALUES ('ENGINE', trim(s."engine")), ('FUEL_TYPE', trim(s."fuelType")), ('TRANSMISSION', trim(s."transmission")), ('COLOR', trim(s."color"))) k(kind,value)
WHERE k.value IS NOT NULL AND k.value<>'' GROUP BY v."organizationId", k.kind, k.value
ON CONFLICT DO NOTHING;
INSERT INTO "VehicleLookupValue" ("id", "organizationId", "kind", "value", "normalizedValue")
SELECT gen_random_uuid()::text, v."organizationId", 'BODY_TYPE', trim(v."bodyType"), lower(trim(v."bodyType"))
FROM "Vehicle" v WHERE v."bodyType" IS NOT NULL AND trim(v."bodyType")<>'' GROUP BY v."organizationId", trim(v."bodyType")
ON CONFLICT DO NOTHING;

CREATE TABLE "ContainerPreset" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL,
  "internalLengthCm" DECIMAL(10,2) NOT NULL, "internalWidthCm" DECIMAL(10,2) NOT NULL, "internalHeightCm" DECIMAL(10,2) NOT NULL,
  "maxVolumeM3" DECIMAL(10,3) NOT NULL, "maxPayloadKg" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContainerPreset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContainerPreset_organizationId_code_key" ON "ContainerPreset"("organizationId", "code");
CREATE INDEX "ContainerPreset_organizationId_active_idx" ON "ContainerPreset"("organizationId", "active");
ALTER TABLE "ContainerPreset" ADD CONSTRAINT "ContainerPreset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "ContainerPreset" ("id","organizationId","code","label","internalLengthCm","internalWidthCm","internalHeightCm","maxVolumeM3","maxPayloadKg")
SELECT gen_random_uuid()::text, o."id", p.code, p.label, p.l, p.w, p.h, p.v, p.kg FROM "Organization" o CROSS JOIN (VALUES
 ('20FT','20 ft standard',589.8,235.2,239.3,33.2,28200),
 ('40FT','40 ft standard',1203.2,235.2,239.3,67.7,26700),
 ('40HC','40 ft High Cube',1203.2,235.2,269.8,76.3,26580)
) p(code,label,l,w,h,v,kg);

ALTER TABLE "Shipment" ADD COLUMN "containerPresetId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "totalFreightCost" DECIMAL(12,2);
ALTER TABLE "Shipment" ADD COLUMN "freightCurrency" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "capacityVolumeM3" DECIMAL(12,3);
ALTER TABLE "Shipment" ADD COLUMN "capacityWeightKg" DECIMAL(12,2);
ALTER TABLE "ShipmentVehicle" ADD COLUMN "capacityOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShipmentVehicle" ADD COLUMN "overrideReason" TEXT;
ALTER TABLE "ShipmentVehicle" ADD COLUMN "addedBy" TEXT;
ALTER TABLE "ShipmentVehicle" ADD COLUMN "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "DossierDocumentAsset" ALTER COLUMN "fileId" DROP NOT NULL;
ALTER TABLE "DossierDocumentAsset" ADD COLUMN "externalUrl" TEXT;
ALTER TABLE "DossierDocumentAsset" ADD COLUMN "shipmentId" TEXT;
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_file_or_url_check" CHECK ("fileId" IS NOT NULL OR "externalUrl" IS NOT NULL);

CREATE TABLE "CustomsFileVehicle" (
 "id" TEXT NOT NULL, "customsFileId" TEXT NOT NULL, "vehicleId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "CustomsFileVehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomsFileVehicle_customsFileId_vehicleId_key" ON "CustomsFileVehicle"("customsFileId","vehicleId");
CREATE INDEX "CustomsFileVehicle_vehicleId_idx" ON "CustomsFileVehicle"("vehicleId");
ALTER TABLE "CustomsFileVehicle" ADD CONSTRAINT "CustomsFileVehicle_customsFileId_fkey" FOREIGN KEY ("customsFileId") REFERENCES "CustomsFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomsFileVehicle" ADD CONSTRAINT "CustomsFileVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "CustomsFileVehicle" ("id","customsFileId","vehicleId")
SELECT gen_random_uuid()::text, "id", "vehicleId" FROM "CustomsFile" WHERE "vehicleId" IS NOT NULL ON CONFLICT DO NOTHING;

ALTER TABLE "OrganizationSettings" ADD COLUMN "insuranceRatePercent" DECIMAL(8,4);
CREATE TABLE "VehicleDutyRate" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "category" TEXT NOT NULL, "ratePercent" DECIMAL(8,4), "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VehicleDutyRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VehicleDutyRate_organizationId_category_key" ON "VehicleDutyRate"("organizationId","category");
CREATE TABLE "LocalDeliveryRate" (
 "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "destination" TEXT NOT NULL, "amount" DECIMAL(12,2), "currency" TEXT NOT NULL DEFAULT 'DZD', "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LocalDeliveryRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LocalDeliveryRate_organizationId_destination_key" ON "LocalDeliveryRate"("organizationId","destination");

CREATE INDEX "Dossier_forwarderSupplierId_idx" ON "Dossier"("forwarderSupplierId");
CREATE INDEX "Vehicle_brandLookupId_idx" ON "Vehicle"("brandLookupId");
CREATE INDEX "Vehicle_modelLookupId_idx" ON "Vehicle"("modelLookupId");
CREATE INDEX "Shipment_containerPresetId_idx" ON "Shipment"("containerPresetId");
CREATE INDEX "DossierDocumentAsset_shipmentId_documentType_idx" ON "DossierDocumentAsset"("shipmentId","documentType");
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_forwarderSupplierId_fkey" FOREIGN KEY ("forwarderSupplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_containerPresetId_fkey" FOREIGN KEY ("containerPresetId") REFERENCES "ContainerPreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleDutyRate" ADD CONSTRAINT "VehicleDutyRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocalDeliveryRate" ADD CONSTRAINT "LocalDeliveryRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
