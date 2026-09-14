-- Preserve every existing offer, quotation, catalogue item and dossier link.
ALTER TABLE "CustomerQuotation" ADD COLUMN "sourceVehicleId" TEXT;
ALTER TABLE "CustomerQuotation" ADD CONSTRAINT "CustomerQuotation_sourceVehicleId_fkey" FOREIGN KEY ("sourceVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CustomerQuotation_sourceVehicleId_idx" ON "CustomerQuotation"("sourceVehicleId");
ALTER TABLE "CustomerQuotation" ADD CONSTRAINT "CustomerQuotation_source_exclusive" CHECK ("sourceVehicleId" IS NULL OR ("sourceOfferId" IS NULL AND "sourceOfferVehicleId" IS NULL AND "sourceOfferRevisionId" IS NULL));
ALTER TABLE "CatalogueItem" ALTER COLUMN "sourceOfferVehicleId" DROP NOT NULL;
ALTER TABLE "CatalogueItem" ADD COLUMN "sourceVehicleId" TEXT;
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_sourceVehicleId_fkey" FOREIGN KEY ("sourceVehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CatalogueItem_sourceVehicleId_key" ON "CatalogueItem"("sourceVehicleId");
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_source_exclusive" CHECK (("sourceVehicleId" IS NOT NULL)::int + ("sourceOfferVehicleId" IS NOT NULL)::int = 1);
ALTER TABLE "CatalogueItem" ADD CONSTRAINT "CatalogueItem_stock_quantity" CHECK ("sourceVehicleId" IS NULL OR "availableQuantity" = 1);
