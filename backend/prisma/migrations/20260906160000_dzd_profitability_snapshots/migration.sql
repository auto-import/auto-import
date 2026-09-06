-- Extend the existing quotation/finance architecture with immutable DZD
-- profitability snapshots. No historical quotation or cost row is replaced.

ALTER TABLE "Cost"
  ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,8) NOT NULL DEFAULT 1;

UPDATE "Cost"
SET "exchangeRateSnapshot" = CASE
  WHEN UPPER("currency") = 'DZD' THEN 1
  WHEN "amount" > 0 AND "amountInBaseCurrency" IS NOT NULL
    THEN ROUND("amountInBaseCurrency" / "amount", 8)
  ELSE 1
END;

ALTER TABLE "Cost"
  ADD CONSTRAINT "Cost_exchange_rate_snapshot_check"
  CHECK ("exchangeRateSnapshot" > 0);

ALTER TABLE "CustomerQuotationRevision"
  ADD COLUMN "sellingPriceDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedCifCostDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedLandedCostDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedTotalCostDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedProfitDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "estimatedMarginPercent" DECIMAL(9,4) NOT NULL DEFAULT 0;

UPDATE "CustomerQuotationRevision" revision
SET
  "sellingPriceDzd" = CASE
    WHEN revision."finalCustomerPriceDzd" > 0
      THEN revision."finalCustomerPriceDzd"
    ELSE ROUND(revision."finalCustomerPrice" * revision."exchangeRateSnapshot", 2)
  END,
  "estimatedCifCostDzd" = ROUND((
    revision."vehicleAmount" + revision."freightAmount" +
    revision."insuranceAmount" + revision."transitAmount" +
    revision."otherCostsAmount"
  ) * revision."exchangeRateSnapshot", 2),
  "estimatedLandedCostDzd" = ROUND((
    revision."vehicleAmount" + revision."freightAmount" +
    revision."insuranceAmount" + revision."transitAmount" +
    revision."otherCostsAmount" + revision."customsAmount"
  ) * revision."exchangeRateSnapshot", 2),
  "estimatedTotalCostDzd" = ROUND((
    revision."vehicleAmount" + revision."freightAmount" +
    revision."insuranceAmount" + revision."transitAmount" +
    revision."otherCostsAmount" +
    CASE WHEN quotation."priceBasis" = 'DDP' THEN revision."customsAmount" ELSE 0 END
  ) * revision."exchangeRateSnapshot", 2)
FROM "CustomerQuotation" quotation
WHERE quotation."id" = revision."quotationId";

UPDATE "CustomerQuotationRevision"
SET
  "estimatedProfitDzd" = "sellingPriceDzd" - "estimatedTotalCostDzd",
  "estimatedMarginPercent" = CASE
    WHEN "sellingPriceDzd" > 0 THEN
      ROUND(("sellingPriceDzd" - "estimatedTotalCostDzd") * 100 / "sellingPriceDzd", 4)
    ELSE 0
  END;

ALTER TABLE "CustomerQuotationRevision"
  ADD CONSTRAINT "CustomerQuotationRevision_dzd_profitability_check"
  CHECK (
    -- Legacy draft revisions were allowed to have a zero selling price. New
    -- quotations are kept strictly positive by DTO/service validation.
    "sellingPriceDzd" >= 0 AND
    "estimatedCifCostDzd" >= 0 AND
    "estimatedLandedCostDzd" >= "estimatedCifCostDzd" AND
    "estimatedTotalCostDzd" >= 0
  );

-- Reuse QuotationOtherCost as the physical table for all immutable quotation
-- cost lines. Existing OTHER rows are retained and enriched in place.
ALTER TABLE "QuotationOtherCost"
  DROP CONSTRAINT IF EXISTS "QuotationOtherCost_currency_check";

ALTER TABLE "QuotationOtherCost"
  ADD COLUMN "costType" TEXT NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "costStatus" TEXT NOT NULL DEFAULT 'ESTIMATED',
  ADD COLUMN "exchangeRateId" TEXT,
  ADD COLUMN "exchangeRateUsed" DECIMAL(18,8) NOT NULL DEFAULT 1,
  ADD COLUMN "amountDzd" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "QuotationOtherCost" cost
SET
  "sortOrder" = cost."sortOrder" + 100,
  "exchangeRateId" = revision."exchangeRateId",
  "exchangeRateUsed" = revision."exchangeRateSnapshot",
  "amountDzd" = ROUND(cost."amount" * revision."exchangeRateSnapshot", 2)
FROM "CustomerQuotationRevision" revision
WHERE revision."id" = cost."revisionId";

INSERT INTO "QuotationOtherCost" (
  "id", "organizationId", "revisionId", "description", "amount",
  "currency", "sortOrder", "costType", "costStatus", "exchangeRateId",
  "exchangeRateUsed", "amountDzd", "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::text, revision."organizationId", revision."id",
  item.description, item.amount, quotation."currency", item.sort_order,
  item.cost_type, 'ESTIMATED', revision."exchangeRateId",
  revision."exchangeRateSnapshot",
  ROUND(item.amount * revision."exchangeRateSnapshot", 2),
  revision."createdAt", revision."createdAt"
FROM "CustomerQuotationRevision" revision
JOIN "CustomerQuotation" quotation ON quotation."id" = revision."quotationId"
CROSS JOIN LATERAL (VALUES
  ('VEHICLE', 'Prix fournisseur véhicule', revision."vehicleAmount", 1),
  ('FREIGHT', 'Fret véhicule', revision."freightAmount", 2),
  ('INSURANCE', 'Assurance', revision."insuranceAmount", 3),
  ('TRANSIT', 'Transit', revision."transitAmount", 4),
  ('CUSTOMS', 'Douane', revision."customsAmount", 5)
) AS item(cost_type, description, amount, sort_order)
WHERE item.amount > 0;

ALTER TABLE "QuotationOtherCost"
  ADD CONSTRAINT "QuotationOtherCost_exchangeRateId_fkey"
  FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "QuotationOtherCost_status_check"
  CHECK ("costStatus" IN ('ESTIMATED', 'ACTUAL')),
  ADD CONSTRAINT "QuotationOtherCost_rate_check"
  CHECK ("exchangeRateUsed" > 0 AND "amountDzd" >= 0);

CREATE INDEX "QuotationOtherCost_exchangeRateId_idx"
  ON "QuotationOtherCost"("exchangeRateId");
CREATE INDEX "QuotationOtherCost_revisionId_costStatus_costType_idx"
  ON "QuotationOtherCost"("revisionId", "costStatus", "costType");

-- A dossier must retain the exact estimate accepted at reservation time even
-- if the quotation later receives another append-only revision.
ALTER TABLE "Dossier"
  ADD COLUMN "commercialQuotationRevisionId" TEXT;

UPDATE "Dossier" dossier
SET "commercialQuotationRevisionId" = quotation."currentRevisionId"
FROM "CustomerQuotation" quotation
WHERE quotation."id" = dossier."commercialQuotationId"
  AND dossier."commercialQuotationRevisionId" IS NULL;

ALTER TABLE "Dossier"
  ADD CONSTRAINT "Dossier_commercialQuotationRevisionId_fkey"
  FOREIGN KEY ("commercialQuotationRevisionId")
  REFERENCES "CustomerQuotationRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Dossier_commercialQuotationRevisionId_idx"
  ON "Dossier"("commercialQuotationRevisionId");
