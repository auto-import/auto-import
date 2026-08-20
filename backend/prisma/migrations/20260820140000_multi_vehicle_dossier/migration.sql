-- CreateTable
CREATE TABLE "DossierVehicle" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DossierVehicle_pkey" PRIMARY KEY ("id")
);

-- Preserve existing data: Migrate Dossier.vehicleId to DossierVehicle
INSERT INTO "DossierVehicle" ("id", "dossierId", "vehicleId", "assignedAt")
SELECT gen_random_uuid()::text, "id", "vehicleId", CURRENT_TIMESTAMP
FROM "Dossier"
WHERE "vehicleId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Dossier" DROP CONSTRAINT IF EXISTS "Dossier_vehicleId_fkey";

-- AlterTable
ALTER TABLE "Dossier" DROP COLUMN IF EXISTS "vehicleId";

-- CreateIndex
CREATE UNIQUE INDEX "DossierVehicle_dossierId_vehicleId_key" ON "DossierVehicle"("dossierId", "vehicleId");

-- AddForeignKey
ALTER TABLE "DossierVehicle" ADD CONSTRAINT "DossierVehicle_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierVehicle" ADD CONSTRAINT "DossierVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
