-- ERP V2 Phase 2: additive central GED expansion and deterministic legacy bridge.
-- No legacy table, link or physical file is deleted by this migration.

ALTER TABLE "FileAsset"
  ADD COLUMN "encryptionState" TEXT NOT NULL DEFAULT 'EXTERNAL_REQUIRED',
  ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "scanProvider" TEXT,
  ADD COLUMN "scannedAt" TIMESTAMP(3),
  ADD COLUMN "integrityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "integrityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "quarantinedAt" TIMESTAMP(3);

UPDATE "FileAsset"
SET "integrityStatus" = CASE
  WHEN length(coalesce("checksum", '')) = 64 THEN 'UNVERIFIED_BACKFILL'
  ELSE 'PENDING'
END;

CREATE TABLE "GedCategory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "description" TEXT,
  "defaultSensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GedCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "GedDocumentType" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GedDocumentType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedDocumentType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GedCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "GedDocument" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT,
  "documentTypeId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "issuingAuthority" TEXT,
  "issueDate" TIMESTAMP(3),
  "expiryDate" TIMESTAMP(3),
  "validationStatus" TEXT NOT NULL DEFAULT 'TO_VALIDATE',
  "sensitivity" TEXT NOT NULL DEFAULT 'INTERNAL',
  "currentVersionId" TEXT,
  "createdBy" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "archivedById" TEXT,
  "archiveReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GedDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GedDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GedCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocument_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "GedDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocument_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocument_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocument_validationStatus_check" CHECK ("validationStatus" IN ('TO_VALIDATE','VALIDATED','REJECTED')),
  CONSTRAINT "GedDocument_sensitivity_check" CHECK ("sensitivity" IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED_IDENTITY','RESTRICTED_BANK','RESTRICTED_PAYMENT','RESTRICTED_CONTRACT','RESTRICTED_CUSTOMS'))
);

CREATE TABLE "GedDocumentVersion" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "changeReason" TEXT,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GedDocumentVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedDocumentVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentVersion_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentVersion_versionNumber_check" CHECK ("versionNumber" > 0),
  CONSTRAINT "GedDocumentVersion_checksum_check" CHECK (length("checksum") = 64)
);

CREATE TABLE "GedDocumentLink" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "prospectId" TEXT,
  "clientId" TEXT,
  "dossierId" TEXT,
  "vehicleId" TEXT,
  "supplierId" TEXT,
  "chinaOfferId" TEXT,
  "purchaseId" TEXT,
  "shipmentId" TEXT,
  "customsFileId" TEXT,
  "paymentId" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "GedDocumentLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedDocumentLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_chinaOfferId_fkey" FOREIGN KEY ("chinaOfferId") REFERENCES "ChinaOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_customsFileId_fkey" FOREIGN KEY ("customsFileId") REFERENCES "CustomsFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedDocumentLink_exactly_one_target_check" CHECK (num_nonnulls("prospectId","clientId","dossierId","vehicleId","supplierId","chinaOfferId","purchaseId","shipmentId","customsFileId","paymentId") = 1)
);

CREATE TABLE "GedValidationHistory" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "reason" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GedValidationHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GedValidationHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GedValidationHistory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "GedDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GedValidationHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DossierChecklistRule" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "organizationId" TEXT NOT NULL,
  "documentTypeId" TEXT NOT NULL,
  "dossierType" TEXT,
  "workflowStatus" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "blocking" BOOLEAN NOT NULL DEFAULT false,
  "expiryWarningDays" INTEGER NOT NULL DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DossierChecklistRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DossierChecklistRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DossierChecklistRule_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "GedDocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierChecklistRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierChecklistRule_expiryWarningDays_check" CHECK ("expiryWarningDays" >= 0)
);

ALTER TABLE "GedDocument"
  ADD CONSTRAINT "GedDocument_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "GedDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DossierDocumentAsset" ADD COLUMN "gedDocumentId" TEXT;
ALTER TABLE "DossierDocumentAsset"
  ADD CONSTRAINT "DossierDocumentAsset_gedDocumentId_fkey" FOREIGN KEY ("gedDocumentId") REFERENCES "GedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "GedCategory_organizationId_code_key" ON "GedCategory"("organizationId", "code");
CREATE INDEX "GedCategory_organizationId_active_sortOrder_idx" ON "GedCategory"("organizationId", "active", "sortOrder");
CREATE UNIQUE INDEX "GedDocumentType_organizationId_code_key" ON "GedDocumentType"("organizationId", "code");
CREATE INDEX "GedDocumentType_organizationId_categoryId_active_sortOrder_idx" ON "GedDocumentType"("organizationId", "categoryId", "active", "sortOrder");
CREATE UNIQUE INDEX "GedDocument_currentVersionId_key" ON "GedDocument"("currentVersionId");
CREATE INDEX "GedDocument_organizationId_validationStatus_expiryDate_idx" ON "GedDocument"("organizationId", "validationStatus", "expiryDate");
CREATE INDEX "GedDocument_organizationId_sensitivity_createdAt_idx" ON "GedDocument"("organizationId", "sensitivity", "createdAt");
CREATE INDEX "GedDocument_categoryId_idx" ON "GedDocument"("categoryId");
CREATE INDEX "GedDocument_documentTypeId_idx" ON "GedDocument"("documentTypeId");
CREATE INDEX "GedDocument_archivedById_idx" ON "GedDocument"("archivedById");
CREATE UNIQUE INDEX "GedDocumentVersion_documentId_versionNumber_key" ON "GedDocumentVersion"("documentId", "versionNumber");
CREATE INDEX "GedDocumentVersion_organizationId_createdAt_idx" ON "GedDocumentVersion"("organizationId", "createdAt");
CREATE INDEX "GedDocumentVersion_fileId_idx" ON "GedDocumentVersion"("fileId");
CREATE INDEX "GedDocumentLink_organizationId_documentId_archivedAt_idx" ON "GedDocumentLink"("organizationId", "documentId", "archivedAt");
CREATE INDEX "GedDocumentLink_prospectId_idx" ON "GedDocumentLink"("prospectId");
CREATE INDEX "GedDocumentLink_clientId_idx" ON "GedDocumentLink"("clientId");
CREATE INDEX "GedDocumentLink_dossierId_idx" ON "GedDocumentLink"("dossierId");
CREATE INDEX "GedDocumentLink_vehicleId_idx" ON "GedDocumentLink"("vehicleId");
CREATE INDEX "GedDocumentLink_supplierId_idx" ON "GedDocumentLink"("supplierId");
CREATE INDEX "GedDocumentLink_chinaOfferId_idx" ON "GedDocumentLink"("chinaOfferId");
CREATE INDEX "GedDocumentLink_purchaseId_idx" ON "GedDocumentLink"("purchaseId");
CREATE INDEX "GedDocumentLink_shipmentId_idx" ON "GedDocumentLink"("shipmentId");
CREATE INDEX "GedDocumentLink_customsFileId_idx" ON "GedDocumentLink"("customsFileId");
CREATE INDEX "GedDocumentLink_paymentId_idx" ON "GedDocumentLink"("paymentId");
CREATE UNIQUE INDEX "GedDocumentLink_active_prospect_key" ON "GedDocumentLink"("documentId", "prospectId") WHERE "prospectId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_client_key" ON "GedDocumentLink"("documentId", "clientId") WHERE "clientId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_dossier_key" ON "GedDocumentLink"("documentId", "dossierId") WHERE "dossierId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_vehicle_key" ON "GedDocumentLink"("documentId", "vehicleId") WHERE "vehicleId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_supplier_key" ON "GedDocumentLink"("documentId", "supplierId") WHERE "supplierId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_offer_key" ON "GedDocumentLink"("documentId", "chinaOfferId") WHERE "chinaOfferId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_purchase_key" ON "GedDocumentLink"("documentId", "purchaseId") WHERE "purchaseId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_shipment_key" ON "GedDocumentLink"("documentId", "shipmentId") WHERE "shipmentId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_customs_key" ON "GedDocumentLink"("documentId", "customsFileId") WHERE "customsFileId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "GedDocumentLink_active_payment_key" ON "GedDocumentLink"("documentId", "paymentId") WHERE "paymentId" IS NOT NULL AND "archivedAt" IS NULL;
CREATE INDEX "GedValidationHistory_organizationId_documentId_createdAt_idx" ON "GedValidationHistory"("organizationId", "documentId", "createdAt");
CREATE INDEX "GedValidationHistory_actorId_createdAt_idx" ON "GedValidationHistory"("actorId", "createdAt");
CREATE UNIQUE INDEX "DossierChecklistRule_scope_key" ON "DossierChecklistRule"("organizationId", "documentTypeId", "dossierType", "workflowStatus");
CREATE INDEX "DossierChecklistRule_scope_lookup_idx" ON "DossierChecklistRule"("organizationId", "active", "dossierType", "workflowStatus");
CREATE UNIQUE INDEX "DossierDocumentAsset_gedDocumentId_key" ON "DossierDocumentAsset"("gedDocumentId");

-- Deterministic and restart-safe backfill. One physical FileAsset is reused.
INSERT INTO "GedCategory" ("id", "organizationId", "code", "labelFr", "defaultSensitivity", "createdAt", "updatedAt")
SELECT 'ged-category-legacy-' || organization."id", organization."id", 'LEGACY', 'Documents historiques', 'INTERNAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" organization
WHERE EXISTS (SELECT 1 FROM "DossierDocumentAsset" legacy WHERE legacy."organizationId" = organization."id")
ON CONFLICT ("organizationId", "code") DO NOTHING;

INSERT INTO "GedDocumentType" ("id", "organizationId", "categoryId", "code", "labelFr", "createdAt", "updatedAt")
SELECT DISTINCT
  'ged-type-' || md5(legacy."organizationId" || ':' || coalesce(legacy."documentType", legacy."kind", 'OTHER')),
  legacy."organizationId",
  category."id",
  'LEGACY_' || upper(md5(coalesce(legacy."documentType", legacy."kind", 'OTHER'))),
  coalesce(legacy."documentType", legacy."kind", 'Autre'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "DossierDocumentAsset" legacy
JOIN "GedCategory" category ON category."organizationId" = legacy."organizationId" AND category."code" = 'LEGACY'
ON CONFLICT ("organizationId", "code") DO NOTHING;

INSERT INTO "GedDocument" (
  "id", "organizationId", "categoryId", "documentTypeId", "title", "description",
  "validationStatus", "sensitivity", "createdBy", "createdAt", "updatedAt"
)
SELECT
  'ged-' || legacy."id",
  legacy."organizationId",
  category."id",
  document_type."id",
  coalesce(nullif(legacy."title", ''), asset."originalName", 'Document'),
  legacy."description",
  CASE lower(legacy."status") WHEN 'valid' THEN 'VALIDATED' WHEN 'rejected' THEN 'REJECTED' ELSE 'TO_VALIDATE' END,
  CASE WHEN coalesce(legacy."documentType", '') ~* '(passport|nin|id_client|identity)' THEN 'RESTRICTED_IDENTITY' ELSE 'INTERNAL' END,
  legacy."uploadedBy",
  legacy."createdAt",
  legacy."updatedAt"
FROM "DossierDocumentAsset" legacy
JOIN "FileAsset" asset ON asset."id" = legacy."fileId"
JOIN "GedCategory" category ON category."organizationId" = legacy."organizationId" AND category."code" = 'LEGACY'
JOIN "GedDocumentType" document_type ON document_type."organizationId" = legacy."organizationId"
  AND document_type."code" = 'LEGACY_' || upper(md5(coalesce(legacy."documentType", legacy."kind", 'OTHER')))
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "GedDocumentVersion" ("id", "organizationId", "documentId", "fileId", "versionNumber", "checksum", "changeReason", "uploadedBy", "createdAt")
SELECT 'ged-version-' || legacy."id", legacy."organizationId", 'ged-' || legacy."id", legacy."fileId", 1,
  asset."checksum", 'Migration du document historique', legacy."uploadedBy", legacy."createdAt"
FROM "DossierDocumentAsset" legacy
JOIN "FileAsset" asset ON asset."id" = legacy."fileId"
WHERE length(coalesce(asset."checksum", '')) = 64
ON CONFLICT ("documentId", "versionNumber") DO NOTHING;

UPDATE "GedDocument" document
SET "currentVersionId" = version."id"
FROM "GedDocumentVersion" version
WHERE version."documentId" = document."id" AND version."versionNumber" = 1 AND document."currentVersionId" IS NULL;

UPDATE "DossierDocumentAsset" legacy
SET "gedDocumentId" = 'ged-' || legacy."id"
WHERE legacy."gedDocumentId" IS NULL
  AND EXISTS (SELECT 1 FROM "GedDocument" document WHERE document."id" = 'ged-' || legacy."id");

INSERT INTO "GedDocumentLink" ("id", "organizationId", "documentId", "dossierId", "createdBy", "createdAt")
SELECT 'ged-link-dossier-' || legacy."id", legacy."organizationId", 'ged-' || legacy."id", legacy."dossierId", legacy."uploadedBy", legacy."createdAt"
FROM "DossierDocumentAsset" legacy
WHERE legacy."dossierId" IS NOT NULL AND legacy."gedDocumentId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "GedDocumentLink" ("id", "organizationId", "documentId", "clientId", "createdBy", "createdAt")
SELECT 'ged-link-client-' || legacy."id", legacy."organizationId", 'ged-' || legacy."id", legacy."clientId", legacy."uploadedBy", legacy."createdAt"
FROM "DossierDocumentAsset" legacy
WHERE legacy."clientId" IS NOT NULL AND legacy."gedDocumentId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Permission" ("id", "resource", "action", "description") VALUES
  (gen_random_uuid(), 'gedMetadata', 'list', 'List GED document metadata'),
  (gen_random_uuid(), 'gedMetadata', 'read', 'Read GED document metadata'),
  (gen_random_uuid(), 'gedMetadata', 'create', 'Create GED document metadata'),
  (gen_random_uuid(), 'gedMetadata', 'update', 'Update GED document metadata'),
  (gen_random_uuid(), 'gedMetadata', 'link', 'Link GED documents to ERP entities'),
  (gen_random_uuid(), 'gedMetadata', 'unlink', 'Archive GED entity links'),
  (gen_random_uuid(), 'gedMetadata', 'archive', 'Archive GED documents'),
  (gen_random_uuid(), 'gedAudit', 'read', 'Read GED audit and validation history'),
  (gen_random_uuid(), 'gedBytes', 'preview', 'Preview authorized GED bytes'),
  (gen_random_uuid(), 'gedBytes', 'download', 'Download authorized GED bytes'),
  (gen_random_uuid(), 'gedBytes', 'upload', 'Upload GED bytes'),
  (gen_random_uuid(), 'gedBytes', 'createVersion', 'Create append-only GED versions'),
  (gen_random_uuid(), 'gedValidation', 'validate', 'Validate GED documents'),
  (gen_random_uuid(), 'gedValidation', 'reject', 'Reject GED documents'),
  (gen_random_uuid(), 'gedSensitive', 'metadata', 'Read restricted GED metadata'),
  (gen_random_uuid(), 'gedSensitive', 'preview', 'Preview restricted GED documents'),
  (gen_random_uuid(), 'gedSensitive', 'download', 'Download restricted GED documents'),
  (gen_random_uuid(), 'gedSensitive', 'upload', 'Upload restricted GED documents'),
  (gen_random_uuid(), 'dossierChecklist', 'read', 'Read dossier GED checklists'),
  (gen_random_uuid(), 'dossierChecklist', 'manage', 'Manage dossier GED checklist rules')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT role_permission."roleId", target."id"
FROM "RolePermission" role_permission
JOIN "Permission" current_permission ON current_permission."id" = role_permission."permissionId"
JOIN "Permission" target ON
  (current_permission."resource" = 'documents' AND current_permission."action" = 'read'
    AND ((target."resource" = 'gedMetadata' AND target."action" IN ('list','read'))
      OR (target."resource" = 'gedBytes' AND target."action" IN ('preview','download'))
      OR (target."resource" = 'dossierChecklist' AND target."action" = 'read')))
  OR (current_permission."resource" = 'documents' AND current_permission."action" = 'write'
    AND ((target."resource" = 'gedMetadata' AND target."action" IN ('create','update','link','unlink'))
      OR (target."resource" = 'gedBytes' AND target."action" IN ('upload','createVersion'))))
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE lower(role."name") IN ('admin', 'administrateur', 'super admin', 'direction')
  AND permission."resource" IN ('gedMetadata','gedAudit','gedBytes','gedValidation','gedSensitive','dossierChecklist')
ON CONFLICT DO NOTHING;
