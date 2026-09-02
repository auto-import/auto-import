-- Additive CRM, China-offer line and catalogue support. No business rows are
-- deleted; legacy offer columns remain available for compatibility.

ALTER TABLE "Prospect"
  ADD COLUMN IF NOT EXISTS "needType" TEXT NOT NULL DEFAULT 'VEHICLE',
  ADD COLUMN IF NOT EXISTS "shippingDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingCargoType" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingDestination" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingRequirements" TEXT;

ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "identityDocumentType" TEXT,
  ADD COLUMN IF NOT EXISTS "identityIssueCountry" TEXT;

CREATE INDEX IF NOT EXISTS "Prospect_organizationId_needType_createdAt_idx"
  ON "Prospect"("organizationId", "needType", "createdAt");

ALTER TABLE "Prospect" DROP CONSTRAINT IF EXISTS "Prospect_needType_check";
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_needType_check"
  CHECK ("needType" IN ('VEHICLE', 'SHIPPING')) NOT VALID;
ALTER TABLE "Prospect" VALIDATE CONSTRAINT "Prospect_needType_check";

ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_identityDocumentType_check";
ALTER TABLE "Client" ADD CONSTRAINT "Client_identityDocumentType_check"
  CHECK ("identityDocumentType" IS NULL OR "identityDocumentType" IN ('PASSPORT', 'NATIONAL_ID')) NOT VALID;
ALTER TABLE "Client" VALIDATE CONSTRAINT "Client_identityDocumentType_check";

-- Preserve the intent of historical shipping-only dossiers when a lead can be
-- reached through its converted client.
UPDATE "Prospect" prospect
SET "needType" = 'SHIPPING'
WHERE EXISTS (
  SELECT 1
  FROM "Client" client
  JOIN "Dossier" dossier ON dossier."clientId" = client."id"
  WHERE client."prospectId" = prospect."id"
    AND dossier."type" = 'SHIPPING_ONLY'
);

-- Required tenant-configurable marketing sources. Existing reference rows and
-- labels are preserved; only missing values are inserted.
INSERT INTO "CrmReferenceValue"
  ("id", "organizationId", "kind", "code", "labelFr", "active", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, organization."id", 'MARKETING_SOURCE', source.code,
       source.label, true, source.position, CURRENT_TIMESTAMP
FROM "Organization" organization
CROSS JOIN (VALUES
  ('GOOGLE_ADS', 'Google Ads', 35),
  ('YOUTUBE', 'YouTube', 40)
) AS source(code, label, position)
ON CONFLICT ("organizationId", "kind", "code") DO UPDATE
SET "labelFr" = EXCLUDED."labelFr", "active" = true;

UPDATE "CrmReferenceValue"
SET "labelFr" = 'Passage bureau', "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'MARKETING_SOURCE' AND "code" = 'OFFICE_VISIT';

-- REJECTED represented a supplier deal that was not won. Keep the history and
-- map the current state to the business term requested by operations.
ALTER TABLE "ChinaOffer" DROP CONSTRAINT IF EXISTS "ChinaOffer_offerStatus_check";
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_offerStatus_check" CHECK (
  "offerStatus" IS NULL OR "offerStatus" IN (
    'RECEIVED','UNDER_VERIFICATION','VALIDATED','REJECTED','RESERVED','PURCHASED','EXPIRED','LOST_DEAL'
  )
);

UPDATE "ChinaOffer" SET "offerStatus" = 'LOST_DEAL'
WHERE "offerStatus" = 'REJECTED';
UPDATE "ChinaOfferStatusHistory" SET "fromStatus" = 'LOST_DEAL'
WHERE "fromStatus" = 'REJECTED';
UPDATE "ChinaOfferStatusHistory" SET "toStatus" = 'LOST_DEAL'
WHERE "toStatus" = 'REJECTED';
UPDATE "ChinaOffer" SET "status" = 'purchased'
WHERE "status" = 'sold';

CREATE TABLE IF NOT EXISTS "ChinaOfferVehicle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "brand" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "version" TEXT,
  "year" INTEGER,
  "condition" TEXT NOT NULL,
  "mileage" INTEGER,
  "specification" JSONB NOT NULL,
  "supplierPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "vin" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "purchasedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "lostReason" TEXT,
  "purchasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChinaOfferVehicle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChinaOfferVehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferVehicle_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ChinaOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferVehicle_quantity_check" CHECK (
    "quantity" >= 1 AND "reservedQuantity" >= 0 AND "purchasedQuantity" >= 0
    AND "reservedQuantity" + "purchasedQuantity" <= "quantity"
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChinaOfferVehicle_offerId_lineNumber_key"
  ON "ChinaOfferVehicle"("offerId", "lineNumber");
CREATE INDEX IF NOT EXISTS "ChinaOfferVehicle_organizationId_status_createdAt_idx"
  ON "ChinaOfferVehicle"("organizationId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ChinaOfferVehicle_offerId_status_idx"
  ON "ChinaOfferVehicle"("offerId", "status");
CREATE INDEX IF NOT EXISTS "ChinaOfferVehicle_organizationId_vin_idx"
  ON "ChinaOfferVehicle"("organizationId", "vin");

-- Every historical one-model offer becomes one line. Purchased quantities are
-- derived from existing Purchase lineage so catalogue history stays intact.
INSERT INTO "ChinaOfferVehicle" (
  "id", "organizationId", "offerId", "lineNumber", "brand", "model",
  "version", "year", "condition", "mileage", "specification",
  "supplierPrice", "currency", "vin", "quantity", "reservedQuantity",
  "purchasedQuantity", "status", "purchasedAt", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, offer."organizationId", offer."id", 1,
       offer."brand", offer."model", offer."version", offer."year",
       offer."condition", offer."mileage", offer."specification",
       COALESCE(offer."supplierPrice", offer."purchasePrice", 0),
       offer."currency", offer."vin",
       GREATEST(1, offer."availableQuantity" + purchase_totals.count),
       LEAST(offer."reservedQuantity", GREATEST(1, offer."availableQuantity" + purchase_totals.count) - purchase_totals.count),
       purchase_totals.count,
       CASE
         WHEN offer."offerStatus" = 'LOST_DEAL' THEN 'LOST_DEAL'
         WHEN purchase_totals.count > 0 AND offer."availableQuantity" <= 0 THEN 'PURCHASED'
         WHEN offer."offerStatus" = 'EXPIRED' OR offer."validUntil" < CURRENT_TIMESTAMP THEN 'EXPIRED'
         ELSE COALESCE(offer."offerStatus", 'RECEIVED')
       END,
       purchase_totals.purchased_at,
       offer."createdAt", offer."updatedAt"
FROM "ChinaOffer" offer
CROSS JOIN LATERAL (
  SELECT COUNT(*)::int AS count, MAX(purchase."purchaseDate") AS purchased_at
  FROM "Purchase" purchase
  WHERE purchase."sourceOfferId" = offer."id" AND purchase."status" <> 'cancelled'
) purchase_totals
ON CONFLICT ("offerId", "lineNumber") DO NOTHING;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "sourceOfferVehicleId" TEXT;
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_sourceOfferVehicleId_fkey";
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_sourceOfferVehicleId_fkey"
  FOREIGN KEY ("sourceOfferVehicleId") REFERENCES "ChinaOfferVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Purchase_sourceOfferVehicleId_idx" ON "Purchase"("sourceOfferVehicleId");

-- Link historical purchases to the backfilled line without changing any
-- purchase, supplier, vehicle, dossier or finance record.
UPDATE "Purchase" purchase
SET "sourceOfferVehicleId" = line."id"
FROM "ChinaOfferVehicle" line
WHERE purchase."sourceOfferId" = line."offerId" AND line."lineNumber" = 1;
