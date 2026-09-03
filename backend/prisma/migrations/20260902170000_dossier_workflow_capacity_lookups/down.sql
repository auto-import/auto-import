-- Development rollback only. Refuses rollback when v2 workflow data exists.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Dossier" WHERE "workflowVersion" = 2) THEN
    RAISE EXCEPTION 'Cannot roll back: workflow v2 dossiers exist';
  END IF;
END $$;
ALTER TABLE "DossierDocumentAsset" DROP CONSTRAINT IF EXISTS "DossierDocumentAsset_shipmentId_fkey";
ALTER TABLE "DossierDocumentAsset" DROP CONSTRAINT IF EXISTS "DossierDocumentAsset_file_or_url_check";
ALTER TABLE "Shipment" DROP CONSTRAINT IF EXISTS "Shipment_containerPresetId_fkey";
ALTER TABLE "Dossier" DROP CONSTRAINT IF EXISTS "Dossier_forwarderSupplierId_fkey";
DROP TABLE IF EXISTS "LocalDeliveryRate";
DROP TABLE IF EXISTS "CustomsFileVehicle";
DROP TABLE IF EXISTS "VehicleDutyRate";
DROP TABLE IF EXISTS "ContainerPreset";
DROP TABLE IF EXISTS "VehicleLookupValue";
ALTER TABLE "OrganizationSettings" DROP COLUMN IF EXISTS "insuranceRatePercent";
ALTER TABLE "DossierDocumentAsset" DROP COLUMN IF EXISTS "shipmentId", DROP COLUMN IF EXISTS "externalUrl";
ALTER TABLE "ShipmentVehicle" DROP COLUMN IF EXISTS "capacityOverride", DROP COLUMN IF EXISTS "overrideReason", DROP COLUMN IF EXISTS "addedBy", DROP COLUMN IF EXISTS "addedAt";
ALTER TABLE "Shipment" DROP COLUMN IF EXISTS "containerPresetId", DROP COLUMN IF EXISTS "totalFreightCost", DROP COLUMN IF EXISTS "freightCurrency", DROP COLUMN IF EXISTS "capacityVolumeM3", DROP COLUMN IF EXISTS "capacityWeightKg";
ALTER TABLE "VehicleSpec" DROP COLUMN IF EXISTS "engineLookupId", DROP COLUMN IF EXISTS "fuelTypeLookupId", DROP COLUMN IF EXISTS "transmissionLookupId", DROP COLUMN IF EXISTS "colorLookupId";
ALTER TABLE "Vehicle" DROP COLUMN IF EXISTS "rejectionReason", DROP COLUMN IF EXISTS "rejectedAt", DROP COLUMN IF EXISTS "rejectedBy", DROP COLUMN IF EXISTS "length_cm", DROP COLUMN IF EXISTS "width_cm", DROP COLUMN IF EXISTS "height_cm", DROP COLUMN IF EXISTS "weight_kg", DROP COLUMN IF EXISTS "brandLookupId", DROP COLUMN IF EXISTS "modelLookupId", DROP COLUMN IF EXISTS "bodyTypeLookupId";
ALTER TABLE "Dossier" DROP COLUMN IF EXISTS "workflowVersion", DROP COLUMN IF EXISTS "forwarderSupplierId", DROP COLUMN IF EXISTS "vehicleBookingVehicleId", DROP COLUMN IF EXISTS "vehicleBookingDate", DROP COLUMN IF EXISTS "vehicleBookingNote", DROP COLUMN IF EXISTS "upgradedFromType", DROP COLUMN IF EXISTS "upgradedAt", DROP COLUMN IF EXISTS "cifPrice", DROP COLUMN IF EXISTS "ddpPrice", DROP COLUMN IF EXISTS "priceCurrency", DROP COLUMN IF EXISTS "priceLockedAt", DROP COLUMN IF EXISTS "dutyOverrideAmount", DROP COLUMN IF EXISTS "dutyOverrideJustification";
