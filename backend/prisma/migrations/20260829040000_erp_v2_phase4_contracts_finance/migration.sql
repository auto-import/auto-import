-- ERP V2 Phase 4: additive contracts, collections, central ledger and treasury.
-- Existing invoices/payments/costs remain readable; no financial row is deleted or rewritten.

ALTER TABLE "Payment" ADD COLUMN "contractId" TEXT;
ALTER TABLE "Cost" ADD COLUMN "costScope" TEXT NOT NULL DEFAULT 'DIRECT';

CREATE TABLE "Contract" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "requiredDeposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "signedAt" TIMESTAMP(3),
  "signedDocumentId" TEXT,
  "invoiceId" TEXT,
  "createdBy" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "prospectId" TEXT,
  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Contract_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_signedDocumentId_fkey" FOREIGN KEY ("signedDocumentId") REFERENCES "GedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Contract_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Contract_amount_check" CHECK ("totalAmount" > 0 AND "requiredDeposit" >= 0 AND "requiredDeposit" <= "totalAmount"),
  CONSTRAINT "Contract_status_check" CHECK ("status" IN ('DRAFT','SIGNED','CANCELLED','CLOSED'))
);
CREATE UNIQUE INDEX "Contract_organizationId_contractNumber_key" ON "Contract"("organizationId","contractNumber");
CREATE INDEX "Contract_organizationId_status_signedAt_idx" ON "Contract"("organizationId","status","signedAt");
CREATE INDEX "Contract_dossierId_createdAt_idx" ON "Contract"("dossierId","createdAt");
CREATE INDEX "Contract_clientId_createdAt_idx" ON "Contract"("clientId","createdAt");
CREATE INDEX "Contract_invoiceId_idx" ON "Contract"("invoiceId");

CREATE TABLE "ContractScheduleItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "contractId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "label" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractScheduleItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractScheduleItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ContractScheduleItem_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "ContractScheduleItem_contractId_sequence_key" ON "ContractScheduleItem"("contractId","sequence");
CREATE INDEX "ContractScheduleItem_dueDate_idx" ON "ContractScheduleItem"("dueDate");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Payment_contractId_idx" ON "Payment"("contractId");

-- The existing exactly-one-target constraint remains intact. Contract documents
-- use signedDocumentId; optional GED visibility links must also retain their
-- tenant-owned dossier target until the Phase 2 link constraint is contracted.
ALTER TABLE "GedDocumentLink" ADD COLUMN "contractId" TEXT;
ALTER TABLE "GedDocumentLink" ADD CONSTRAINT "GedDocumentLink_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "GedDocumentLink_contractId_idx" ON "GedDocumentLink"("contractId");

CREATE TABLE "TreasuryAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasuryAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TreasuryAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TreasuryAccount_type_check" CHECK ("type" IN ('CASH','BANK','CURRENCY','OTHER'))
);
CREATE UNIQUE INDEX "TreasuryAccount_organizationId_code_key" ON "TreasuryAccount"("organizationId","code");
CREATE INDEX "TreasuryAccount_organizationId_status_currency_idx" ON "TreasuryAccount"("organizationId","status","currency");

CREATE TABLE "FinanceTransaction" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "sourceRecordId" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "originalAmount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "exchangeRateSnapshot" DECIMAL(18,8) NOT NULL,
  "amountDzd" DECIMAL(14,2) NOT NULL,
  "dossierId" TEXT,
  "clientId" TEXT,
  "supplierId" TEXT,
  "treasuryAccountId" TEXT,
  "paymentMode" TEXT,
  "reference" TEXT,
  "supportingDocumentId" TEXT,
  "customerPaymentId" TEXT,
  "supplierPaymentId" TEXT,
  "costId" TEXT,
  "purchaseId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdBy" TEXT NOT NULL,
  "validatedBy" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validatedAt" TIMESTAMP(3),
  "reversalOfId" TEXT,
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "prospectId" TEXT,
  CONSTRAINT "FinanceTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_treasuryAccountId_fkey" FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_supportingDocumentId_fkey" FOREIGN KEY ("supportingDocumentId") REFERENCES "GedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "SupplierPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_costId_fkey" FOREIGN KEY ("costId") REFERENCES "Cost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_validatedBy_fkey" FOREIGN KEY ("validatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinanceTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FinanceTransaction_amount_check" CHECK ("originalAmount" > 0 AND "exchangeRateSnapshot" > 0 AND "amountDzd" > 0),
  CONSTRAINT "FinanceTransaction_direction_check" CHECK ("direction" IN ('CREDIT','DEBIT')),
  CONSTRAINT "FinanceTransaction_status_check" CHECK ("status" IN ('PENDING','VALIDATED','REVERSED','CANCELLED'))
);
CREATE UNIQUE INDEX "FinanceTransaction_organizationId_sourceModule_sourceRecordId_key" ON "FinanceTransaction"("organizationId","sourceModule","sourceRecordId");
CREATE UNIQUE INDEX "FinanceTransaction_organizationId_idempotencyKey_key" ON "FinanceTransaction"("organizationId","idempotencyKey");
CREATE UNIQUE INDEX "FinanceTransaction_customerPaymentId_key" ON "FinanceTransaction"("customerPaymentId");
CREATE UNIQUE INDEX "FinanceTransaction_supplierPaymentId_key" ON "FinanceTransaction"("supplierPaymentId");
CREATE UNIQUE INDEX "FinanceTransaction_costId_key" ON "FinanceTransaction"("costId");
CREATE INDEX "FinanceTransaction_organizationId_status_occurredAt_idx" ON "FinanceTransaction"("organizationId","status","occurredAt");
CREATE INDEX "FinanceTransaction_organizationId_type_occurredAt_idx" ON "FinanceTransaction"("organizationId","type","occurredAt");
CREATE INDEX "FinanceTransaction_treasuryAccountId_status_occurredAt_idx" ON "FinanceTransaction"("treasuryAccountId","status","occurredAt");
CREATE INDEX "FinanceTransaction_dossierId_status_occurredAt_idx" ON "FinanceTransaction"("dossierId","status","occurredAt");
CREATE INDEX "FinanceTransaction_clientId_idx" ON "FinanceTransaction"("clientId");
CREATE INDEX "FinanceTransaction_supplierId_idx" ON "FinanceTransaction"("supplierId");
CREATE INDEX "FinanceTransaction_purchaseId_idx" ON "FinanceTransaction"("purchaseId");
CREATE INDEX "FinanceTransaction_reversalOfId_idx" ON "FinanceTransaction"("reversalOfId");

INSERT INTO "Permission" ("id","resource","action","description") VALUES
  (gen_random_uuid(),'contracts','read','Read customer contracts and computed collection balances'),
  (gen_random_uuid(),'contracts','write','Create customer contracts and collection schedules'),
  (gen_random_uuid(),'contracts','sign','Sign contracts against authorized GED documents'),
  (gen_random_uuid(),'finance','reverse','Create authorized immutable finance reversals'),
  (gen_random_uuid(),'treasury','read','Read treasury accounts and derived balances'),
  (gen_random_uuid(),'treasury','write','Create and manage treasury accounts')
ON CONFLICT ("resource","action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId","permissionId")
SELECT role."id", permission."id" FROM "Role" role CROSS JOIN "Permission" permission
WHERE lower(role."name") IN ('admin','administrateur','super admin','direction','finance')
  AND permission."resource" IN ('contracts','finance','treasury')
ON CONFLICT DO NOTHING;

-- Ledger backfill is deliberately deferred: historical rates, validators and
-- treasury accounts must be reconciled, not invented.
