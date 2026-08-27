-- Phase 1 core commerce additions. Existing rows are preserved and tenant ownership is backfilled.
ALTER TABLE "Partner"
  ADD COLUMN "website" TEXT,
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "deliveryTerms" TEXT,
  ADD COLUMN "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notes" TEXT;

ALTER TABLE "Vehicle" ADD COLUMN "archivedAt" TIMESTAMP(3);
UPDATE "Vehicle" SET "acquisitionType" = 'clientRequest' WHERE "acquisitionType" = 'client_request';
UPDATE "VehicleRequest" SET "status" = 'candidateSelected' WHERE "status" = 'validated';
ALTER TABLE "StockMovement" ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DROP INDEX "StockMovement_organizationId_createdAt_idx";
DROP INDEX "StockMovement_vehicleId_createdAt_idx";
CREATE INDEX "StockMovement_organizationId_occurredAt_idx" ON "StockMovement"("organizationId", "occurredAt");
CREATE INDEX "StockMovement_vehicleId_occurredAt_idx" ON "StockMovement"("vehicleId", "occurredAt");

CREATE TABLE "CommerceSequence" (
  "organizationId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceSequence_pkey" PRIMARY KEY ("organizationId", "key")
);

CREATE TABLE "ChinaOffer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "version" TEXT,
  "year" INTEGER,
  "condition" TEXT NOT NULL,
  "mileage" INTEGER,
  "specification" JSONB NOT NULL,
  "purchasePrice" DECIMAL(12,2),
  "cifPrice" DECIMAL(12,2) NOT NULL,
  "ddpPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "availableQuantity" INTEGER NOT NULL,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "estimatedDelayDays" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'available',
  "notes" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChinaOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChinaOffer_dates_check" CHECK ("validUntil" >= "validFrom"),
  CONSTRAINT "ChinaOffer_quantities_check" CHECK ("availableQuantity" >= 0 AND "reservedQuantity" >= 0 AND "reservedQuantity" <= "availableQuantity"),
  CONSTRAINT "ChinaOffer_currency_check" CHECK ("currency" IN ('DZD','USD','CNY','EUR'))
);

CREATE TABLE "OfferReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "dossierId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expiresAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfferReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferReservation_quantity_check" CHECK ("quantity" > 0)
);

ALTER TABLE "Reservation"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "releaseReason" TEXT;

UPDATE "Reservation" r
SET "organizationId" = v."organizationId"
FROM "Vehicle" v
WHERE v."id" = r."vehicleId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Reservation" WHERE "organizationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill Reservation.organizationId: a reservation references a missing vehicle';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Reservation" WHERE "status" = 'active'
    GROUP BY "vehicleId" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active reservation per vehicle: duplicate active reservations exist';
  END IF;
END $$;

ALTER TABLE "Reservation" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Purchase"
  ADD COLUMN "vehicleRequestId" TEXT,
  ADD COLUMN "candidateId" TEXT,
  ADD COLUMN "dossierId" TEXT,
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "supplierSnapshot" JSONB,
  ADD COLUMN "vehicleSnapshot" JSONB;
ALTER TABLE "Purchase" ADD COLUMN "offerReservationId" TEXT;

DROP INDEX "Dossier_reference_key";
DROP INDEX "Order_orderNumber_key";
DROP INDEX "Purchase_purchaseNumber_key";
CREATE UNIQUE INDEX "Dossier_organizationId_reference_key" ON "Dossier"("organizationId", "reference");
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");
CREATE UNIQUE INDEX "Purchase_organizationId_purchaseNumber_key" ON "Purchase"("organizationId", "purchaseNumber");

CREATE UNIQUE INDEX "ChinaOffer_organizationId_reference_key" ON "ChinaOffer"("organizationId", "reference");
CREATE INDEX "ChinaOffer_organizationId_status_validUntil_idx" ON "ChinaOffer"("organizationId", "status", "validUntil");
CREATE INDEX "ChinaOffer_organizationId_supplierId_createdAt_idx" ON "ChinaOffer"("organizationId", "supplierId", "createdAt");
CREATE UNIQUE INDEX "OfferReservation_dossierId_key" ON "OfferReservation"("dossierId");
CREATE INDEX "OfferReservation_organizationId_status_expiresAt_idx" ON "OfferReservation"("organizationId", "status", "expiresAt");
CREATE INDEX "OfferReservation_offerId_status_idx" ON "OfferReservation"("offerId", "status");
CREATE INDEX "OfferReservation_clientId_createdAt_idx" ON "OfferReservation"("clientId", "createdAt");
CREATE INDEX "Reservation_organizationId_status_expiresAt_idx" ON "Reservation"("organizationId", "status", "expiresAt");
CREATE UNIQUE INDEX "Reservation_one_active_vehicle_idx" ON "Reservation"("vehicleId") WHERE "status" = 'active';
CREATE UNIQUE INDEX "Purchase_vehicleRequestId_key" ON "Purchase"("vehicleRequestId");
CREATE UNIQUE INDEX "Purchase_candidateId_key" ON "Purchase"("candidateId");
CREATE UNIQUE INDEX "Purchase_offerReservationId_key" ON "Purchase"("offerReservationId");
CREATE INDEX "Purchase_dossierId_idx" ON "Purchase"("dossierId");
CREATE INDEX "Purchase_orderId_idx" ON "Purchase"("orderId");

ALTER TABLE "CommerceSequence" ADD CONSTRAINT "CommerceSequence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferReservation" ADD CONSTRAINT "OfferReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferReservation" ADD CONSTRAINT "OfferReservation_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferReservation" ADD CONSTRAINT "OfferReservation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferReservation" ADD CONSTRAINT "OfferReservation_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_vehicleRequestId_fkey" FOREIGN KEY ("vehicleRequestId") REFERENCES "VehicleRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "VehicleCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_offerReservationId_fkey" FOREIGN KEY ("offerReservationId") REFERENCES "OfferReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
