-- ERP V2 Phase 3: additive supplier authority and immutable China-offer revisions.
-- Legacy partner/offer fields remain available during the compatibility window.

ALTER TABLE "Partner"
  ADD COLUMN "supplierType" TEXT,
  ADD COLUMN "supplierStatus" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "wechat" TEXT,
  ADD COLUMN "preferredCurrency" TEXT,
  ADD COLUMN "incoterms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "averageLeadTimeDays" INTEGER,
  ADD COLUMN "scoreReliability" INTEGER,
  ADD COLUMN "scoreQuality" INTEGER,
  ADD COLUMN "scoreDelivery" INTEGER,
  ADD COLUMN "scoreCommunication" INTEGER;

ALTER TABLE "Partner"
  ADD CONSTRAINT "Partner_supplierStatus_check" CHECK ("supplierStatus" IS NULL OR "supplierStatus" IN ('TO_VERIFY','VERIFIED','ACTIVE','SUSPENDED')),
  ADD CONSTRAINT "Partner_supplier_scores_check" CHECK (
    ("scoreReliability" IS NULL OR "scoreReliability" BETWEEN 0 AND 100) AND
    ("scoreQuality" IS NULL OR "scoreQuality" BETWEEN 0 AND 100) AND
    ("scoreDelivery" IS NULL OR "scoreDelivery" BETWEEN 0 AND 100) AND
    ("scoreCommunication" IS NULL OR "scoreCommunication" BETWEEN 0 AND 100)
  );

UPDATE "Partner"
SET "supplierStatus" = CASE lower("status")
  WHEN 'active' THEN 'ACTIVE'
  WHEN 'inactive' THEN 'TO_VERIFY'
  WHEN 'archived' THEN 'SUSPENDED'
  ELSE NULL
END
WHERE "type" = 'supplier' AND "supplierStatus" IS NULL;

CREATE INDEX "Partner_organizationId_type_supplierStatus_idx" ON "Partner"("organizationId", "type", "supplierStatus");

CREATE TABLE "SupplierContact" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "phone" TEXT,
  "phoneNormalized" TEXT,
  "email" TEXT,
  "whatsapp" TEXT,
  "wechat" TEXT,
  "preferred" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierContact_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SupplierContact_supplierId_phoneNormalized_key" ON "SupplierContact"("supplierId", "phoneNormalized");
CREATE INDEX "SupplierContact_organizationId_supplierId_active_idx" ON "SupplierContact"("organizationId", "supplierId", "active");

CREATE TABLE "SupplierBankAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "bankName" TEXT,
  "currency" TEXT NOT NULL,
  "encryptedDetails" TEXT NOT NULL,
  "lastFour" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierBankAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierBankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierBankAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierBankAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierBankAccount_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SupplierBankAccount_organizationId_supplierId_status_idx" ON "SupplierBankAccount"("organizationId", "supplierId", "status");

CREATE TABLE "SupplierIncident" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "reportedBy" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierIncident_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierIncident_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierIncident_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierIncident_severity_check" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "SupplierIncident_status_check" CHECK ("status" IN ('OPEN','RESOLVED'))
);

CREATE INDEX "SupplierIncident_organizationId_supplierId_status_occurredAt_idx" ON "SupplierIncident"("organizationId", "supplierId", "status", "occurredAt");

CREATE TABLE "SupplierDossierLink" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierDossierLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierDossierLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierDossierLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierDossierLink_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierDossierLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SupplierDossierLink_supplierId_dossierId_key" ON "SupplierDossierLink"("supplierId", "dossierId");
CREATE INDEX "SupplierDossierLink_organizationId_dossierId_idx" ON "SupplierDossierLink"("organizationId", "dossierId");

ALTER TABLE "ChinaOffer"
  ADD COLUMN "supplierPrice" DECIMAL(12,2),
  ADD COLUMN "supplierReference" TEXT,
  ADD COLUMN "incoterm" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "leadTimeDays" INTEGER,
  ADD COLUMN "paymentConditions" TEXT,
  ADD COLUMN "vin" TEXT,
  ADD COLUMN "offerStatus" TEXT,
  ADD COLUMN "currentRevisionId" TEXT;

UPDATE "ChinaOffer"
SET "supplierPrice" = coalesce("purchasePrice", "cifPrice"),
    "leadTimeDays" = coalesce("leadTimeDays", "estimatedDelayDays"),
    "offerStatus" = CASE
      WHEN "archivedAt" IS NOT NULL OR lower("status") IN ('rejected','archived') THEN 'REJECTED'
      WHEN lower("status") = 'reserved' OR "reservedQuantity" > 0 THEN 'RESERVED'
      WHEN lower("status") IN ('available','active','validated') THEN 'VALIDATED'
      WHEN lower("status") IN ('under_verification','under verification') THEN 'UNDER_VERIFICATION'
      ELSE NULL
    END
WHERE "supplierPrice" IS NULL OR "offerStatus" IS NULL;

ALTER TABLE "ChinaOffer"
  ADD CONSTRAINT "ChinaOffer_offerStatus_check" CHECK ("offerStatus" IS NULL OR "offerStatus" IN ('RECEIVED','UNDER_VERIFICATION','VALIDATED','REJECTED','RESERVED'));

CREATE TABLE "ChinaOfferRevision" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "supplierPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "incoterm" TEXT,
  "location" TEXT,
  "quantity" INTEGER NOT NULL,
  "leadTimeDays" INTEGER,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "paymentConditions" TEXT,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChinaOfferRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChinaOfferRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferRevision_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferRevision_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferRevision_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "ChinaOfferRevision_price_check" CHECK ("supplierPrice" > 0),
  CONSTRAINT "ChinaOfferRevision_dates_check" CHECK ("validUntil" >= "validFrom")
);

CREATE UNIQUE INDEX "ChinaOfferRevision_offerId_revisionNumber_key" ON "ChinaOfferRevision"("offerId", "revisionNumber");
CREATE INDEX "ChinaOfferRevision_organizationId_offerId_createdAt_idx" ON "ChinaOfferRevision"("organizationId", "offerId", "createdAt");
CREATE UNIQUE INDEX "ChinaOffer_currentRevisionId_key" ON "ChinaOffer"("currentRevisionId");
ALTER TABLE "ChinaOffer" ADD CONSTRAINT "ChinaOffer_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "ChinaOfferRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ChinaOffer_organizationId_offerStatus_validUntil_idx" ON "ChinaOffer"("organizationId", "offerStatus", "validUntil");

CREATE TABLE "ChinaOfferStatusHistory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChinaOfferStatusHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChinaOfferStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferStatusHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChinaOfferStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChinaOfferStatusHistory_organizationId_offerId_createdAt_idx" ON "ChinaOfferStatusHistory"("organizationId", "offerId", "createdAt");

ALTER TABLE "Purchase"
  ADD COLUMN "sourceOfferId" TEXT,
  ADD COLUMN "sourceOfferRevisionId" TEXT;
ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_sourceOfferId_fkey" FOREIGN KEY ("sourceOfferId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Purchase_sourceOfferRevisionId_fkey" FOREIGN KEY ("sourceOfferRevisionId") REFERENCES "ChinaOfferRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Purchase_sourceOfferId_idx" ON "Purchase"("sourceOfferId");
CREATE INDEX "Purchase_sourceOfferRevisionId_idx" ON "Purchase"("sourceOfferRevisionId");

-- Trace existing materialized purchases through their reservation without guessing revisions.
UPDATE "Purchase" purchase
SET "sourceOfferId" = reservation."offerId"
FROM "OfferReservation" reservation
WHERE purchase."offerReservationId" = reservation."id" AND purchase."sourceOfferId" IS NULL;

INSERT INTO "Permission" ("id", "resource", "action", "description") VALUES
  (gen_random_uuid(), 'suppliers', 'verify', 'Transition supplier verification status'),
  (gen_random_uuid(), 'suppliersBank', 'metadata', 'Read masked supplier bank metadata'),
  (gen_random_uuid(), 'suppliersBank', 'reveal', 'Reveal encrypted supplier bank details'),
  (gen_random_uuid(), 'suppliersBank', 'write', 'Create or archive supplier bank details'),
  (gen_random_uuid(), 'suppliersIncidents', 'manage', 'Manage supplier incidents'),
  (gen_random_uuid(), 'suppliersScore', 'manage', 'Manage supplier score components'),
  (gen_random_uuid(), 'offers', 'transition', 'Transition China offer workflow')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT role_permission."roleId", target."id"
FROM "RolePermission" role_permission
JOIN "Permission" current_permission ON current_permission."id" = role_permission."permissionId"
JOIN "Permission" target ON
  (current_permission."resource" = 'partners' AND current_permission."action" = 'read'
    AND target."resource" = 'suppliersBank' AND target."action" = 'metadata')
  OR (current_permission."resource" = 'offers' AND current_permission."action" = 'write'
    AND target."resource" = 'offers' AND target."action" = 'transition')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE lower(role."name") IN ('admin', 'administrateur', 'super admin', 'direction', 'finance')
  AND permission."resource" IN ('suppliers','suppliersBank','suppliersIncidents','suppliersScore','offers')
ON CONFLICT DO NOTHING;

-- Unknown supplierStatus/offerStatus values remain NULL and are deployment reconciliation gates.
