-- Additive commercial workflow: supplier offer -> independent quotation ->
-- catalogue projection -> dossier. Historical dossier-bound quotations and
-- offer reservations remain intact and are deliberately not auto-published.

ALTER TABLE "ChinaOffer"
  ADD COLUMN "localCost" DECIMAL(12,2),
  ADD COLUMN "totalOfferPrice" DECIMAL(12,2),
  ADD COLUMN "brandLookupId" TEXT,
  ADD COLUMN "modelLookupId" TEXT,
  ADD COLUMN "versionLookupId" TEXT;

UPDATE "ChinaOffer"
SET "localCost" = 0,
    "totalOfferPrice" = COALESCE("supplierPrice", "purchasePrice")
WHERE "totalOfferPrice" IS NULL;

ALTER TABLE "ChinaOfferRevision"
  ADD COLUMN "localCost" DECIMAL(12,2),
  ADD COLUMN "totalOfferPrice" DECIMAL(12,2);

UPDATE "ChinaOfferRevision"
SET "localCost" = 0,
    "totalOfferPrice" = "supplierPrice"
WHERE "totalOfferPrice" IS NULL;

ALTER TABLE "ChinaOfferVehicle"
  ADD COLUMN "brandLookupId" TEXT,
  ADD COLUMN "modelLookupId" TEXT,
  ADD COLUMN "versionLookupId" TEXT;

CREATE INDEX "ChinaOffer_brandLookupId_idx" ON "ChinaOffer"("brandLookupId");
CREATE INDEX "ChinaOffer_modelLookupId_idx" ON "ChinaOffer"("modelLookupId");
CREATE INDEX "ChinaOffer_versionLookupId_idx" ON "ChinaOffer"("versionLookupId");
CREATE INDEX "ChinaOfferVehicle_brandLookupId_idx" ON "ChinaOfferVehicle"("brandLookupId");
CREATE INDEX "ChinaOfferVehicle_modelLookupId_idx" ON "ChinaOfferVehicle"("modelLookupId");
CREATE INDEX "ChinaOfferVehicle_versionLookupId_idx" ON "ChinaOfferVehicle"("versionLookupId");

ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_brandLookupId_fkey"
  FOREIGN KEY ("brandLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_modelLookupId_fkey"
  FOREIGN KEY ("modelLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_versionLookupId_fkey"
  FOREIGN KEY ("versionLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOfferVehicle" ADD CONSTRAINT "ChinaOfferVehicle_brandLookupId_fkey"
  FOREIGN KEY ("brandLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOfferVehicle" ADD CONSTRAINT "ChinaOfferVehicle_modelLookupId_fkey"
  FOREIGN KEY ("modelLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChinaOfferVehicle" ADD CONSTRAINT "ChinaOfferVehicle_versionLookupId_fkey"
  FOREIGN KEY ("versionLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerQuotation"
  ALTER COLUMN "dossierId" DROP NOT NULL,
  ALTER COLUMN "clientId" DROP NOT NULL,
  ADD COLUMN "sourceOfferVehicleId" TEXT,
  ADD COLUMN "cataloguePublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

ALTER TABLE "CustomerQuotationRevision"
  ADD COLUMN "containerPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "containerAllocation" INTEGER,
  ADD COLUMN "exchangeRateId" TEXT,
  ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN "finalCustomerPriceDzd" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "CustomerQuotationRevision"
  DROP CONSTRAINT IF EXISTS "CustomerQuotationRevision_amounts_check";
ALTER TABLE "CustomerQuotationRevision"
  ADD CONSTRAINT "CustomerQuotationRevision_amounts_check" CHECK (
    "vehicleAmount" >= 0 AND "freightAmount" >= 0 AND
    "insuranceAmount" >= 0 AND "customsAmount" >= 0 AND
    "transitAmount" >= 0 AND "otherCostsAmount" >= 0 AND
    "marginAmount" >= 0 AND "finalCustomerPrice" > 0 AND
    "containerPrice" >= 0 AND "exchangeRateSnapshot" > 0 AND
    "finalCustomerPriceDzd" >= 0
  );
ALTER TABLE "CustomerQuotationRevision"
  ADD CONSTRAINT "CustomerQuotationRevision_container_allocation_check" CHECK (
    "containerAllocation" IS NULL OR "containerAllocation" IN (3, 4)
  );

CREATE INDEX "CustomerQuotation_sourceOfferVehicleId_idx"
  ON "CustomerQuotation"("sourceOfferVehicleId");
CREATE INDEX "CustomerQuotation_organizationId_cataloguePublished_createdAt_idx"
  ON "CustomerQuotation"("organizationId", "cataloguePublished", "createdAt");
CREATE INDEX "CustomerQuotationRevision_exchangeRateId_idx"
  ON "CustomerQuotationRevision"("exchangeRateId");

ALTER TABLE "CustomerQuotation" ADD CONSTRAINT "CustomerQuotation_sourceOfferVehicleId_fkey"
  FOREIGN KEY ("sourceOfferVehicleId") REFERENCES "ChinaOfferVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerQuotationRevision" ADD CONSTRAINT "CustomerQuotationRevision_exchangeRateId_fkey"
  FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "QuotationOtherCost" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuotationOtherCost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QuotationOtherCost_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "QuotationOtherCost_currency_check" CHECK ("currency" = 'USD'),
  CONSTRAINT "QuotationOtherCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuotationOtherCost_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CustomerQuotationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "QuotationOtherCost_revisionId_sortOrder_key"
  ON "QuotationOtherCost"("revisionId", "sortOrder");
CREATE INDEX "QuotationOtherCost_organizationId_createdAt_idx"
  ON "QuotationOtherCost"("organizationId", "createdAt");

CREATE TABLE "CatalogueItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "sourceOfferVehicleId" TEXT NOT NULL,
  "activeCifQuotationId" TEXT,
  "activeDdpQuotationId" TEXT,
  "availableQuantity" INTEGER NOT NULL,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogueItem_quantity_check" CHECK (
    "availableQuantity" >= 0 AND "reservedQuantity" >= 0 AND
    "reservedQuantity" <= "availableQuantity"
  ),
  CONSTRAINT "CatalogueItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogueItem_sourceOfferVehicleId_fkey" FOREIGN KEY ("sourceOfferVehicleId") REFERENCES "ChinaOfferVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogueItem_activeCifQuotationId_fkey" FOREIGN KEY ("activeCifQuotationId") REFERENCES "CustomerQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CatalogueItem_activeDdpQuotationId_fkey" FOREIGN KEY ("activeDdpQuotationId") REFERENCES "CustomerQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CatalogueItem_sourceOfferVehicleId_key"
  ON "CatalogueItem"("sourceOfferVehicleId");
CREATE INDEX "CatalogueItem_organizationId_archivedAt_publishedAt_idx"
  ON "CatalogueItem"("organizationId", "archivedAt", "publishedAt");
CREATE INDEX "CatalogueItem_activeCifQuotationId_idx"
  ON "CatalogueItem"("activeCifQuotationId");
CREATE INDEX "CatalogueItem_activeDdpQuotationId_idx"
  ON "CatalogueItem"("activeDdpQuotationId");

ALTER TABLE "Dossier"
  ADD COLUMN "catalogueItemId" TEXT,
  ADD COLUMN "commercialQuotationId" TEXT;
CREATE INDEX "Dossier_catalogueItemId_idx" ON "Dossier"("catalogueItemId");
CREATE INDEX "Dossier_commercialQuotationId_idx" ON "Dossier"("commercialQuotationId");
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_catalogueItemId_fkey"
  FOREIGN KEY ("catalogueItemId") REFERENCES "CatalogueItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_commercialQuotationId_fkey"
  FOREIGN KEY ("commercialQuotationId") REFERENCES "CustomerQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing quotations stay private because there is no reliable historical
-- publication decision to backfill. New application code publishes only after
-- backend pricing validation and creates CatalogueItem rows transactionally.
