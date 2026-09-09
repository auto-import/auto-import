-- AlterTable: Add maxVehicles to ContainerPreset (business rule: 3 or 4 vehicles per container)
ALTER TABLE "ContainerPreset" ADD COLUMN "maxVehicles" INTEGER NOT NULL DEFAULT 4;

-- AlterTable: Add per-vehicle freight allocation to ShipmentVehicle
ALTER TABLE "ShipmentVehicle" ADD COLUMN "freightShare" DECIMAL(12,2);
ALTER TABLE "ShipmentVehicle" ADD COLUMN "freightCurrency" TEXT;
