-- ERP stabilization: distinct customer quotations, supplier-payment schedules,
-- safe historical backfills, and reconciliation of additive V2 projections.

ALTER TABLE "SupplierPayment"
  ADD COLUMN "paymentKind" TEXT NOT NULL DEFAULT 'COMPLEMENT';

UPDATE "SupplierPayment" payment
SET "paymentKind" = CASE
  WHEN payment."amount" >= purchase."purchasePrice" THEN 'BALANCE'
  ELSE 'COMPLEMENT'
END
FROM "Purchase" purchase
WHERE purchase.id = payment."purchaseId";

ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_paymentKind_check"
  CHECK ("paymentKind" IN ('DEPOSIT','COMPLEMENT','BALANCE'));

CREATE TABLE "CustomerQuotation" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "quotationNumber" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sourceOfferId" TEXT,
  "sourceOfferRevisionId" TEXT,
  "priceBasis" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currentRevisionId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerQuotation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerQuotation_priceBasis_check" CHECK ("priceBasis" IN ('CIF','DDP')),
  CONSTRAINT "CustomerQuotation_status_check" CHECK ("status" IN ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED')),
  CONSTRAINT "CustomerQuotation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotation_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotation_sourceOfferId_fkey" FOREIGN KEY ("sourceOfferId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotation_sourceOfferRevisionId_fkey" FOREIGN KEY ("sourceOfferRevisionId") REFERENCES "ChinaOfferRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CustomerQuotationRevision" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "vehicleAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "freightAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "insuranceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "customsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "transitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "otherCostsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "marginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "finalCustomerPrice" DECIMAL(14,2) NOT NULL,
  "paymentConditions" TEXT,
  "validityNote" TEXT,
  "notes" TEXT,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerQuotationRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerQuotationRevision_amounts_check" CHECK (
    "vehicleAmount" >= 0 AND "freightAmount" >= 0 AND
    "insuranceAmount" >= 0 AND "customsAmount" >= 0 AND
    "transitAmount" >= 0 AND "otherCostsAmount" >= 0 AND
    "marginAmount" >= 0 AND "finalCustomerPrice" > 0 AND
    "finalCustomerPrice" = "vehicleAmount" + "freightAmount" +
      "insuranceAmount" + "customsAmount" + "transitAmount" +
      "otherCostsAmount" + "marginAmount"
  ),
  CONSTRAINT "CustomerQuotationRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotationRevision_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CustomerQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerQuotationRevision_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerQuotation_currentRevisionId_key" ON "CustomerQuotation"("currentRevisionId");
CREATE UNIQUE INDEX "CustomerQuotation_organizationId_quotationNumber_key" ON "CustomerQuotation"("organizationId","quotationNumber");
CREATE INDEX "CustomerQuotation_organizationId_status_createdAt_idx" ON "CustomerQuotation"("organizationId","status","createdAt");
CREATE INDEX "CustomerQuotation_dossierId_createdAt_idx" ON "CustomerQuotation"("dossierId","createdAt");
CREATE INDEX "CustomerQuotation_clientId_createdAt_idx" ON "CustomerQuotation"("clientId","createdAt");
CREATE INDEX "CustomerQuotation_sourceOfferId_idx" ON "CustomerQuotation"("sourceOfferId");
CREATE UNIQUE INDEX "CustomerQuotationRevision_quotationId_revisionNumber_key" ON "CustomerQuotationRevision"("quotationId","revisionNumber");
CREATE INDEX "CustomerQuotationRevision_organizationId_quotationId_createdAt_idx" ON "CustomerQuotationRevision"("organizationId","quotationId","createdAt");

ALTER TABLE "CustomerQuotation"
  ADD CONSTRAINT "CustomerQuotation_currentRevisionId_fkey"
  FOREIGN KEY ("currentRevisionId") REFERENCES "CustomerQuotationRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The client-facing status includes expiry; availability remains a separate projection.
ALTER TABLE "ChinaOffer" DROP CONSTRAINT IF EXISTS "ChinaOffer_offerStatus_check";
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_offerStatus_check" CHECK (
  "offerStatus" IS NULL OR "offerStatus" IN (
    'RECEIVED','UNDER_VERIFICATION','VALIDATED','REJECTED','RESERVED','EXPIRED'
  )
);

UPDATE "ChinaOffer"
SET "offerStatus" = CASE
  WHEN "validUntil" < CURRENT_TIMESTAMP AND coalesce("offerStatus", '') <> 'REJECTED' THEN 'EXPIRED'
  WHEN "offerStatus" IS NULL THEN 'RECEIVED'
  ELSE "offerStatus"
END;

-- Preserve a revision baseline for every historical supplier offer. The first
-- tenant user is attribution metadata only; no supplier price is invented.
INSERT INTO "ChinaOfferRevision" (
  "organizationId","offerId","revisionNumber","supplierPrice","currency",
  "incoterm","location","quantity","leadTimeDays","validFrom","validUntil",
  "paymentConditions","snapshot","reason","createdBy","createdAt"
)
SELECT offer."organizationId", offer.id, 1, offer."supplierPrice", offer.currency,
       offer.incoterm, offer.location, offer."availableQuantity",
       coalesce(offer."leadTimeDays", offer."estimatedDelayDays"),
       offer."validFrom", offer."validUntil", offer."paymentConditions",
       jsonb_build_object(
         'brand', offer.brand, 'model', offer.model, 'version', offer.version,
         'year', offer.year, 'condition', offer.condition, 'mileage', offer.mileage,
         'specification', offer.specification
       ),
       'Reprise historique lors de la stabilisation ERP', actor.id, offer."createdAt"
FROM "ChinaOffer" offer
CROSS JOIN LATERAL (
  SELECT "User".id FROM "User"
  WHERE "User"."organizationId" = offer."organizationId"
  ORDER BY "User"."createdAt", "User".id LIMIT 1
) actor
WHERE offer."supplierPrice" > 0
  AND NOT EXISTS (SELECT 1 FROM "ChinaOfferRevision" revision WHERE revision."offerId" = offer.id);

UPDATE "ChinaOffer" offer
SET "currentRevisionId" = revision.id
FROM "ChinaOfferRevision" revision
WHERE revision."offerId" = offer.id AND revision."revisionNumber" = 1
  AND offer."currentRevisionId" IS NULL;

-- Marketing wording required by the commercial workflow.
UPDATE "CrmReferenceValue"
SET "labelFr" = 'Passage bureau'
WHERE "kind" = 'MARKETING_SOURCE' AND "code" = 'OFFICE_VISIT'
  AND "labelFr" = 'Visite au bureau';

-- Central-ledger backfill for already validated source records. A row is only
-- created when an actual historical rate exists (or the currency is DZD).
INSERT INTO "FinanceTransaction" (
  "organizationId","type","direction","sourceModule","sourceRecordId",
  "idempotencyKey","originalAmount","currency","exchangeRateSnapshot",
  "amountDzd","dossierId","clientId","paymentMode","reference",
  "customerPaymentId","status","createdBy","validatedBy","validatedAt","occurredAt"
)
SELECT payment."organizationId", 'CUSTOMER_COLLECTION', 'CREDIT',
       'CUSTOMER_PAYMENT', payment.id, 'payment:' || payment.id,
       payment.amount, payment.currency, rate.value,
       round(payment.amount * rate.value, 2), payment."dossierId", payment."clientId",
       payment."paymentMethod", payment.reference, payment.id, 'VALIDATED',
       actor.id, actor.id, coalesce(payment."confirmedAt", payment."updatedAt"),
       coalesce(payment."paymentDate", payment."createdAt")
FROM "Payment" payment
CROSS JOIN LATERAL (
  SELECT "User".id FROM "User"
  WHERE "User"."organizationId" = payment."organizationId"
  ORDER BY ("User".id = payment."actorUserId") DESC, "User"."createdAt" LIMIT 1
) actor
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN payment.currency = 'DZD' THEN 1::numeric
    ELSE coalesce(
      (SELECT exchange.rate FROM "ExchangeRate" exchange
       WHERE exchange."organizationId" = payment."organizationId"
         AND exchange."baseCurrency" = 'DZD' AND exchange."quoteCurrency" = payment.currency
         AND exchange."effectiveAt" <= coalesce(payment."paymentDate", payment."createdAt")
       ORDER BY exchange."effectiveAt" DESC LIMIT 1),
      (SELECT 1 / exchange.rate FROM "ExchangeRate" exchange
       WHERE exchange."organizationId" = payment."organizationId"
         AND exchange."baseCurrency" = payment.currency AND exchange."quoteCurrency" = 'DZD'
         AND exchange.rate <> 0
         AND exchange."effectiveAt" <= coalesce(payment."paymentDate", payment."createdAt")
       ORDER BY exchange."effectiveAt" DESC LIMIT 1)
    ) END AS value
) rate
WHERE payment.status = 'CONFIRMED' AND rate.value IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction" ledger WHERE ledger."customerPaymentId" = payment.id);

INSERT INTO "FinanceTransaction" (
  "organizationId","type","direction","sourceModule","sourceRecordId",
  "idempotencyKey","originalAmount","currency","exchangeRateSnapshot",
  "amountDzd","dossierId","supplierId","paymentMode","reference",
  "supplierPaymentId","purchaseId","status","createdBy","validatedBy","validatedAt","occurredAt"
)
SELECT payment."organizationId", 'SUPPLIER_PAYMENT', 'DEBIT',
       'SUPPLIER_PAYMENT', payment.id, 'supplier-payment:' || payment.id,
       payment.amount, payment.currency, rate.value,
       round(payment.amount * rate.value, 2), purchase."dossierId", payment."supplierId",
       payment."paymentMethod", payment.reference, payment.id, payment."purchaseId", 'VALIDATED',
       actor.id, actor.id, coalesce(payment."confirmedAt", payment."updatedAt"),
       coalesce(payment."paymentDate", payment."createdAt")
FROM "SupplierPayment" payment
JOIN "Purchase" purchase ON purchase.id = payment."purchaseId"
CROSS JOIN LATERAL (
  SELECT "User".id FROM "User"
  WHERE "User"."organizationId" = payment."organizationId"
  ORDER BY ("User".id = payment."actorUserId") DESC, "User"."createdAt" LIMIT 1
) actor
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN payment.currency = 'DZD' THEN 1::numeric
    ELSE coalesce(
      (SELECT exchange.rate FROM "ExchangeRate" exchange
       WHERE exchange."organizationId" = payment."organizationId"
         AND exchange."baseCurrency" = 'DZD' AND exchange."quoteCurrency" = payment.currency
         AND exchange."effectiveAt" <= coalesce(payment."paymentDate", payment."createdAt")
       ORDER BY exchange."effectiveAt" DESC LIMIT 1),
      (SELECT 1 / exchange.rate FROM "ExchangeRate" exchange
       WHERE exchange."organizationId" = payment."organizationId"
         AND exchange."baseCurrency" = payment.currency AND exchange."quoteCurrency" = 'DZD'
         AND exchange.rate <> 0
         AND exchange."effectiveAt" <= coalesce(payment."paymentDate", payment."createdAt")
       ORDER BY exchange."effectiveAt" DESC LIMIT 1)
    ) END AS value
) rate
WHERE payment.status = 'CONFIRMED' AND rate.value IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction" ledger WHERE ledger."supplierPaymentId" = payment.id);

INSERT INTO "FinanceTransaction" (
  "organizationId","type","direction","sourceModule","sourceRecordId",
  "idempotencyKey","originalAmount","currency","exchangeRateSnapshot",
  "amountDzd","dossierId","purchaseId","costId","status","createdBy",
  "validatedBy","validatedAt","occurredAt"
)
SELECT cost."organizationId",
       CASE WHEN cost."costScope" = 'OPERATING' THEN 'OPERATING_EXPENSE' ELSE 'DIRECT_COST_' || cost.type END,
       'DEBIT', 'COST', cost.id, 'cost:' || cost.id, cost.amount, cost.currency,
       CASE WHEN cost.amount = 0 THEN 1 ELSE cost."amountInBaseCurrency" / cost.amount END,
       cost."amountInBaseCurrency", cost."dossierId", cost."purchaseId", cost.id,
       'VALIDATED', actor.id, actor.id, cost."createdAt", cost."occurredAt"
FROM "Cost" cost
CROSS JOIN LATERAL (
  SELECT "User".id FROM "User"
  WHERE "User"."organizationId" = cost."organizationId"
  ORDER BY ("User".id = cost."actorUserId") DESC, "User"."createdAt" LIMIT 1
) actor
WHERE cost.status = 'POSTED' AND cost."amountInBaseCurrency" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "FinanceTransaction" ledger WHERE ledger."costId" = cost.id);

-- Deterministic legacy customs mapping and responsibility backfill. All links
-- already passed the phase-5 tenant/cardinality checks.
UPDATE "CustomsFile" customs
SET "responsibleUserId" = coalesce(dossier."opsUserId", dossier."salesUserId")
FROM "Dossier" dossier
WHERE dossier.id = customs."dossierId" AND customs."responsibleUserId" IS NULL;

UPDATE "CustomsFile"
SET "v2Status" = CASE status
  WHEN 'documentsPending' THEN 'TO_PREPARE'
  WHEN 'underReview' THEN 'CLEARANCE_IN_PROGRESS'
  WHEN 'dutiesDue' THEN 'DUTIES_TAXES'
  WHEN 'blocked' THEN 'INSPECTION'
  ELSE "v2Status"
END
WHERE "v2Status" IS NULL;

UPDATE "CustomsFile"
SET "reconciliationRequired" = false
WHERE "v2Status" IS NOT NULL AND "shipmentId" IS NOT NULL
  AND "vehicleId" IS NOT NULL AND "dossierId" IS NOT NULL;
