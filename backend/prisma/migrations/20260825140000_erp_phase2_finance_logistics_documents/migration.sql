-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentInstallment" DROP CONSTRAINT "PaymentInstallment_paymentPlanId_fkey";

-- DropForeignKey
ALTER TABLE "PaymentPlan" DROP CONSTRAINT "PaymentPlan_orderId_fkey";

-- DropIndex
DROP INDEX "CustomsFile_reference_key";

-- DropIndex
DROP INDEX "Invoice_invoiceNumber_key";

-- DropIndex
DROP INDEX "Invoice_orderId_status_idx";

-- DropIndex
DROP INDEX "Payment_status_paymentDate_idx";

-- DropIndex
DROP INDEX "PaymentPlan_orderId_status_idx";

-- DropIndex
DROP INDEX "Shipment_shipmentNumber_key";

-- DropIndex
DROP INDEX "SupplierPayment_purchaseId_status_idx";

-- AlterTable
ALTER TABLE "CustomerDeposit" ADD COLUMN     "appliedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "unappliedAmount" DECIMAL(12,2),
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

UPDATE "CustomerDeposit"
SET "unappliedAmount" = "amount",
    "updatedAt" = "createdAt"
WHERE "unappliedAmount" IS NULL OR "updatedAt" IS NULL;

ALTER TABLE "CustomerDeposit"
ALTER COLUMN "unappliedAmount" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "CustomsFile" ADD COLUMN     "brokerPartnerId" TEXT,
ADD COLUMN     "clearedAt" TIMESTAMP(3),
ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "dutyAmount" DECIMAL(12,2),
ADD COLUMN     "feesAmount" DECIMAL(12,2),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "taxAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "checksum" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- Derive legacy file ownership only from predecessor relations that already
-- carried authoritative tenant ownership. Each source is retained separately
-- so disagreements abort before any ownership value is written.
CREATE TEMP TABLE "_phase2_fileasset_ownership_evidence" (
    "fileId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT fa."id", u."organizationId", 'file_uploader'
FROM "FileAsset" fa
JOIN "User" u ON u."id" = fa."uploadedBy";

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT vp."fileId", v."organizationId", 'vehicle_photo.vehicle'
FROM "VehiclePhoto" vp
JOIN "Vehicle" v ON v."id" = vp."vehicleId";

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT cd."fileId", cf."organizationId", 'customs_document.customs_file'
FROM "CustomsDocument" cd
JOIN "CustomsFile" cf ON cf."id" = cd."customsFileId";

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", u."organizationId", 'business_document.uploader'
FROM "BusinessDocument" bd
JOIN "User" u ON u."id" = bd."uploadedBy";

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", d."organizationId", 'business_document.dossier'
FROM "BusinessDocument" bd
JOIN "Dossier" d ON d."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('dossier', 'dossiers');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", c."organizationId", 'business_document.client'
FROM "BusinessDocument" bd
JOIN "Client" c ON c."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('client', 'clients');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", v."organizationId", 'business_document.vehicle'
FROM "BusinessDocument" bd
JOIN "Vehicle" v ON v."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('vehicle', 'vehicles', 'vehicule', 'vehicules');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", p."organizationId", 'business_document.prospect'
FROM "BusinessDocument" bd
JOIN "Prospect" p ON p."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('prospect', 'prospects', 'lead', 'leads');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", o."organizationId", 'business_document.order'
FROM "BusinessDocument" bd
JOIN "Order" o ON o."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('order', 'orders', 'commande', 'commandes');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", p."organizationId", 'business_document.purchase'
FROM "BusinessDocument" bd
JOIN "Purchase" p ON p."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('purchase', 'purchases', 'achat', 'achats');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", s."organizationId", 'business_document.shipment'
FROM "BusinessDocument" bd
JOIN "Shipment" s ON s."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('shipment', 'shipments', 'expedition', 'expeditions');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", cf."organizationId", 'business_document.customs_file'
FROM "BusinessDocument" bd
JOIN "CustomsFile" cf ON cf."id" = bd."entityId"
WHERE lower(bd."entityType") IN ('customs', 'customs_file', 'customsfile', 'douane');

-- Invoices and payments did not carry organizationId in the predecessor
-- schema. Their order/client/installment chains are the authoritative sources.
INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", o."organizationId", 'business_document.invoice.order'
FROM "BusinessDocument" bd
JOIN "Invoice" i ON i."id" = bd."entityId"
JOIN "Order" o ON o."id" = i."orderId"
WHERE lower(bd."entityType") IN ('invoice', 'invoices', 'facture', 'factures');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", c."organizationId", 'business_document.invoice.client'
FROM "BusinessDocument" bd
JOIN "Invoice" i ON i."id" = bd."entityId"
JOIN "Client" c ON c."id" = i."clientId"
WHERE lower(bd."entityType") IN ('invoice', 'invoices', 'facture', 'factures');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", o."organizationId", 'business_document.payment.invoice_order'
FROM "BusinessDocument" bd
JOIN "Payment" p ON p."id" = bd."entityId"
JOIN "Invoice" i ON i."id" = p."invoiceId"
JOIN "Order" o ON o."id" = i."orderId"
WHERE lower(bd."entityType") IN ('payment', 'payments', 'paiement', 'paiements');

INSERT INTO "_phase2_fileasset_ownership_evidence" ("fileId", "organizationId", "source")
SELECT bd."fileId", o."organizationId", 'business_document.payment.installment_order'
FROM "BusinessDocument" bd
JOIN "Payment" p ON p."id" = bd."entityId"
JOIN "PaymentInstallment" pi ON pi."id" = p."installmentId"
JOIN "PaymentPlan" pp ON pp."id" = pi."paymentPlanId"
JOIN "Order" o ON o."id" = pp."orderId"
WHERE lower(bd."entityType") IN ('payment', 'payments', 'paiement', 'paiements');

DO $$
DECLARE
    conflict_details TEXT;
BEGIN
    SELECT string_agg(format('%s=[%s]', conflicts."fileId", conflicts.evidence), '; ' ORDER BY conflicts."fileId")
    INTO conflict_details
    FROM (
        SELECT evidence."fileId",
               string_agg(DISTINCT evidence."source" || ':' || evidence."organizationId", ', ' ORDER BY evidence."source" || ':' || evidence."organizationId") AS evidence
        FROM "_phase2_fileasset_ownership_evidence" evidence
        GROUP BY evidence."fileId"
        HAVING count(DISTINCT evidence."organizationId") > 1
    ) conflicts;

    IF conflict_details IS NOT NULL THEN
        RAISE EXCEPTION 'FileAsset ownership conflicts: %', conflict_details;
    END IF;
END $$;

UPDATE "FileAsset" fa
SET "organizationId" = resolved."organizationId",
    "updatedAt" = fa."createdAt"
FROM (
    SELECT evidence."fileId", min(evidence."organizationId") AS "organizationId"
    FROM "_phase2_fileasset_ownership_evidence" evidence
    GROUP BY evidence."fileId"
    HAVING count(DISTINCT evidence."organizationId") = 1
) resolved
WHERE fa."id" = resolved."fileId";

DO $$
DECLARE
    unresolved_count BIGINT;
    unresolved_ids TEXT;
BEGIN
    SELECT count(*), string_agg(fa."id", ', ' ORDER BY fa."id")
    INTO unresolved_count, unresolved_ids
    FROM "FileAsset" fa
    WHERE fa."organizationId" IS NULL;

    IF unresolved_count > 0 THEN
        RAISE EXCEPTION 'Unresolved FileAsset ownership: count=%, ids=%, evidence=<none>', unresolved_count, unresolved_ids;
    END IF;
END $$;

UPDATE "FileAsset"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "FileAsset"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

DROP TABLE "_phase2_fileasset_ownership_evidence";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
ALTER COLUMN "issueDate" DROP NOT NULL,
ALTER COLUMN "issueDate" DROP DEFAULT;

DO $$
DECLARE
    conflict_ids TEXT;
BEGIN
    SELECT string_agg(i."id", ', ' ORDER BY i."id")
    INTO conflict_ids
    FROM "Invoice" i
    JOIN "Order" o ON o."id" = i."orderId"
    JOIN "Client" c ON c."id" = i."clientId"
    WHERE o."organizationId" <> c."organizationId";

    IF conflict_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Invoice tenant ownership conflicts: ids=%', conflict_ids;
    END IF;
END $$;

UPDATE "Invoice" i
SET "organizationId" = o."organizationId",
    "updatedAt" = i."createdAt"
FROM "Order" o
WHERE o."id" = i."orderId";

DO $$
DECLARE
    unresolved_ids TEXT;
BEGIN
    SELECT string_agg(i."id", ', ' ORDER BY i."id") INTO unresolved_ids
    FROM "Invoice" i WHERE i."organizationId" IS NULL;
    IF unresolved_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Unresolved Invoice ownership: ids=%', unresolved_ids;
    END IF;
END $$;

ALTER TABLE "Invoice"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceEntity" TEXT,
ADD COLUMN     "tax" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "allocatedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "exchangeRateId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "unallocatedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE TEMP TABLE "_phase2_payment_ownership_evidence" (
    "paymentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "source" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO "_phase2_payment_ownership_evidence" ("paymentId", "organizationId", "clientId", "source")
SELECT p."id", o."organizationId", i."clientId", 'invoice_order'
FROM "Payment" p
JOIN "Invoice" i ON i."id" = p."invoiceId"
JOIN "Order" o ON o."id" = i."orderId";

INSERT INTO "_phase2_payment_ownership_evidence" ("paymentId", "organizationId", "clientId", "source")
SELECT p."id", o."organizationId", o."clientId", 'installment_order'
FROM "Payment" p
JOIN "PaymentInstallment" pi ON pi."id" = p."installmentId"
JOIN "PaymentPlan" pp ON pp."id" = pi."paymentPlanId"
JOIN "Order" o ON o."id" = pp."orderId";

DO $$
DECLARE
    conflict_details TEXT;
BEGIN
    SELECT string_agg(format('%s=[%s]', conflicts."paymentId", conflicts.evidence), '; ' ORDER BY conflicts."paymentId")
    INTO conflict_details
    FROM (
        SELECT evidence."paymentId",
               string_agg(DISTINCT evidence."source" || ':' || evidence."organizationId" || '/' || evidence."clientId", ', ' ORDER BY evidence."source" || ':' || evidence."organizationId" || '/' || evidence."clientId") AS evidence
        FROM "_phase2_payment_ownership_evidence" evidence
        GROUP BY evidence."paymentId"
        HAVING count(DISTINCT evidence."organizationId") > 1 OR count(DISTINCT evidence."clientId") > 1
    ) conflicts;
    IF conflict_details IS NOT NULL THEN
        RAISE EXCEPTION 'Payment ownership conflicts: %', conflict_details;
    END IF;
END $$;

UPDATE "Payment" p
SET "organizationId" = resolved."organizationId",
    "clientId" = resolved."clientId",
    "updatedAt" = p."createdAt",
    "unallocatedAmount" = p."amount"
FROM (
    SELECT evidence."paymentId",
           min(evidence."organizationId") AS "organizationId",
           min(evidence."clientId") AS "clientId"
    FROM "_phase2_payment_ownership_evidence" evidence
    GROUP BY evidence."paymentId"
    HAVING count(DISTINCT evidence."organizationId") = 1 AND count(DISTINCT evidence."clientId") = 1
) resolved
WHERE p."id" = resolved."paymentId";

DO $$
DECLARE
    unresolved_ids TEXT;
BEGIN
    SELECT string_agg(p."id", ', ' ORDER BY p."id") INTO unresolved_ids
    FROM "Payment" p
    WHERE p."organizationId" IS NULL OR p."clientId" IS NULL;
    IF unresolved_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Unresolved Payment ownership: ids=%', unresolved_ids;
    END IF;
END $$;

ALTER TABLE "Payment"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "clientId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

DROP TABLE "_phase2_payment_ownership_evidence";

-- AlterTable
ALTER TABLE "PaymentInstallment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dueTrigger" TEXT NOT NULL DEFAULT 'ON_PLAN_CREATION',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ALTER COLUMN "dueDate" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

UPDATE "PaymentInstallment"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "PaymentInstallment" ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "PaymentPlan" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "dossierId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "strategy" TEXT NOT NULL DEFAULT 'THIRTY_SEVENTY',
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ALTER COLUMN "orderId" DROP NOT NULL;

UPDATE "PaymentPlan" pp
SET "organizationId" = o."organizationId",
    "clientId" = o."clientId",
    "updatedAt" = pp."createdAt"
FROM "Order" o
WHERE o."id" = pp."orderId";

DO $$
DECLARE
    unresolved_ids TEXT;
BEGIN
    SELECT string_agg(pp."id", ', ' ORDER BY pp."id") INTO unresolved_ids
    FROM "PaymentPlan" pp
    WHERE pp."organizationId" IS NULL OR pp."clientId" IS NULL;
    IF unresolved_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Unresolved PaymentPlan ownership: ids=%', unresolved_ids;
    END IF;
END $$;

ALTER TABLE "PaymentPlan"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "clientId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "actualArrivalDate" TIMESTAMP(3),
ADD COLUMN     "actualDepartureDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN     "actorUserId" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "exchangeRateId" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

DO $$
DECLARE
    conflict_ids TEXT;
BEGIN
    SELECT string_agg(sp."id", ', ' ORDER BY sp."id") INTO conflict_ids
    FROM "SupplierPayment" sp
    JOIN "Purchase" p ON p."id" = sp."purchaseId"
    JOIN "Partner" supplier ON supplier."id" = p."supplierId"
    WHERE p."organizationId" <> supplier."organizationId";
    IF conflict_ids IS NOT NULL THEN
        RAISE EXCEPTION 'SupplierPayment tenant ownership conflicts: ids=%', conflict_ids;
    END IF;
END $$;

UPDATE "SupplierPayment" sp
SET "organizationId" = p."organizationId",
    "supplierId" = p."supplierId",
    "updatedAt" = sp."createdAt"
FROM "Purchase" p
WHERE p."id" = sp."purchaseId";

DO $$
DECLARE
    unresolved_ids TEXT;
BEGIN
    SELECT string_agg(sp."id", ', ' ORDER BY sp."id") INTO unresolved_ids
    FROM "SupplierPayment" sp
    WHERE sp."organizationId" IS NULL OR sp."supplierId" IS NULL;
    IF unresolved_ids IS NOT NULL THEN
        RAISE EXCEPTION 'Unresolved SupplierPayment ownership: ids=%', unresolved_ids;
    END IF;
END $$;

ALTER TABLE "SupplierPayment"
ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "supplierId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "ShipmentStatusHistory" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsStatusHistory" (
    "id" TEXT NOT NULL,
    "customsFileId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DossierDocumentAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "documentType" TEXT,
    "title" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DossierDocumentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DossierNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DossierNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "installmentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRateId" TEXT,
    "amountInBaseCurrency" DECIMAL(12,2),
    "dossierId" TEXT,
    "orderId" TEXT,
    "purchaseId" TEXT,
    "shipmentId" TEXT,
    "customsFileId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "actorUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_shipmentId_createdAt_idx" ON "ShipmentStatusHistory"("shipmentId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipmentStatusHistory_changedBy_idx" ON "ShipmentStatusHistory"("changedBy");

-- CreateIndex
CREATE INDEX "CustomsStatusHistory_customsFileId_createdAt_idx" ON "CustomsStatusHistory"("customsFileId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomsStatusHistory_changedBy_idx" ON "CustomsStatusHistory"("changedBy");

-- CreateIndex
CREATE INDEX "DossierDocumentAsset_organizationId_dossierId_kind_status_idx" ON "DossierDocumentAsset"("organizationId", "dossierId", "kind", "status");

-- CreateIndex
CREATE INDEX "DossierDocumentAsset_fileId_idx" ON "DossierDocumentAsset"("fileId");

-- CreateIndex
CREATE INDEX "DossierDocumentAsset_dossierId_documentType_idx" ON "DossierDocumentAsset"("dossierId", "documentType");

-- CreateIndex
CREATE INDEX "DossierNote_organizationId_dossierId_createdAt_idx" ON "DossierNote"("organizationId", "dossierId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentId_idx" ON "PaymentAllocation"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installmentId_idx" ON "PaymentAllocation"("installmentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_organizationId_status_idx" ON "PaymentAllocation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExchangeRate_organizationId_baseCurrency_quoteCurrency_effe_idx" ON "ExchangeRate"("organizationId", "baseCurrency", "quoteCurrency", "effectiveAt");

-- CreateIndex
CREATE INDEX "Cost_organizationId_type_status_idx" ON "Cost"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "Cost_dossierId_idx" ON "Cost"("dossierId");

-- CreateIndex
CREATE INDEX "Cost_orderId_idx" ON "Cost"("orderId");

-- CreateIndex
CREATE INDEX "Cost_purchaseId_idx" ON "Cost"("purchaseId");

-- CreateIndex
CREATE INDEX "Cost_shipmentId_idx" ON "Cost"("shipmentId");

-- CreateIndex
CREATE INDEX "Cost_customsFileId_idx" ON "Cost"("customsFileId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDeposit_paymentId_key" ON "CustomerDeposit"("paymentId");

-- CreateIndex
CREATE INDEX "CustomerDeposit_dossierId_idx" ON "CustomerDeposit"("dossierId");

-- CreateIndex
CREATE INDEX "CustomsFile_dossierId_idx" ON "CustomsFile"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomsFile_organizationId_reference_key" ON "CustomsFile"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "FileAsset_organizationId_category_status_idx" ON "FileAsset"("organizationId", "category", "status");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_issueDate_idx" ON "Invoice"("organizationId", "status", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_dossierId_idx" ON "Invoice"("dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Payment_organizationId_status_paymentDate_idx" ON "Payment"("organizationId", "status", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_clientId_idx" ON "Payment"("clientId");

-- CreateIndex
CREATE INDEX "Payment_dossierId_idx" ON "Payment"("dossierId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentPlan_organizationId_status_idx" ON "PaymentPlan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PaymentPlan_dossierId_idx" ON "PaymentPlan"("dossierId");

-- CreateIndex
CREATE INDEX "PaymentPlan_orderId_idx" ON "PaymentPlan"("orderId");

-- CreateIndex
CREATE INDEX "PaymentPlan_clientId_idx" ON "PaymentPlan"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_organizationId_shipmentNumber_key" ON "Shipment"("organizationId", "shipmentNumber");

-- CreateIndex
CREATE INDEX "SupplierPayment_organizationId_status_paymentDate_idx" ON "SupplierPayment"("organizationId", "status", "paymentDate");

-- CreateIndex
CREATE INDEX "SupplierPayment_purchaseId_idx" ON "SupplierPayment"("purchaseId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_organizationId_idempotencyKey_key" ON "SupplierPayment"("organizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentStatusHistory" ADD CONSTRAINT "ShipmentStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsFile" ADD CONSTRAINT "CustomsFile_brokerPartnerId_fkey" FOREIGN KEY ("brokerPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsStatusHistory" ADD CONSTRAINT "CustomsStatusHistory_customsFileId_fkey" FOREIGN KEY ("customsFileId") REFERENCES "CustomsFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsStatusHistory" ADD CONSTRAINT "CustomsStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierDocumentAsset" ADD CONSTRAINT "DossierDocumentAsset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierNote" ADD CONSTRAINT "DossierNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierNote" ADD CONSTRAINT "DossierNote_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierNote" ADD CONSTRAINT "DossierNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstallment" ADD CONSTRAINT "PaymentInstallment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PaymentInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_customsFileId_fkey" FOREIGN KEY ("customsFileId") REFERENCES "CustomsFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
