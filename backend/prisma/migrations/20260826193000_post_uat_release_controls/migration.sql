-- Post-UAT release controls. Nullable-first additions preserve populated databases.
ALTER TABLE "User" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'fr';

ALTER TABLE "Client"
  ADD COLUMN "passportEncrypted" TEXT,
  ADD COLUMN "passportLookupHash" TEXT,
  ADD COLUMN "ninEncrypted" TEXT,
  ADD COLUMN "ninLookupHash" TEXT,
  ADD COLUMN "identityIssueDate" TIMESTAMP(3);

CREATE UNIQUE INDEX "Client_organizationId_ninLookupHash_key"
  ON "Client"("organizationId", "ninLookupHash");
CREATE UNIQUE INDEX "Client_organizationId_passportLookupHash_key"
  ON "Client"("organizationId", "passportLookupHash");

ALTER TABLE "Vehicle"
  ADD COLUMN "trim" TEXT,
  ADD COLUMN "bodyType" TEXT,
  ADD COLUMN "drivetrain" TEXT,
  ADD COLUMN "displacement" TEXT,
  ADD COLUMN "steeringSide" TEXT,
  ADD COLUMN "interiorColor" TEXT,
  ADD COLUMN "warranty" TEXT,
  ADD COLUMN "equipment" JSONB;

ALTER TABLE "DossierDocumentAsset" ALTER COLUMN "dossierId" DROP NOT NULL;
ALTER TABLE "DossierDocumentAsset" ADD COLUMN "clientId" TEXT;
UPDATE "DossierDocumentAsset" document
SET "clientId" = dossier."clientId"
FROM "Dossier" dossier
WHERE document."dossierId" = dossier."id";
ALTER TABLE "DossierDocumentAsset"
  DROP CONSTRAINT "DossierDocumentAsset_dossierId_fkey";
ALTER TABLE "DossierDocumentAsset"
  ADD CONSTRAINT "DossierDocumentAsset_dossierId_fkey"
  FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DossierDocumentAsset"
  ADD CONSTRAINT "DossierDocumentAsset_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DossierDocumentAsset_organizationId_clientId_createdAt_idx"
  ON "DossierDocumentAsset"("organizationId", "clientId", "createdAt");

CREATE TABLE "OfferPhoto" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferPhoto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferPhoto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferPhoto_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ChinaOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfferPhoto_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OfferPhoto_offerId_sortOrder_key" ON "OfferPhoto"("offerId", "sortOrder");
CREATE INDEX "OfferPhoto_organizationId_offerId_idx" ON "OfferPhoto"("organizationId", "offerId");
CREATE INDEX "OfferPhoto_fileId_idx" ON "OfferPhoto"("fileId");

CREATE TABLE "DossierCheckpointEvidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "checkpoint" TEXT NOT NULL,
  "note" TEXT,
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "uploadedBy" TEXT NOT NULL,
  "reliedAt" TIMESTAMP(3),
  "replacedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DossierCheckpointEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DossierCheckpointEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierCheckpointEvidence_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierCheckpointEvidence_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierCheckpointEvidence_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DossierCheckpointEvidence_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "DossierCheckpointEvidence_organizationId_dossierId_checkpoi_idx"
  ON "DossierCheckpointEvidence"("organizationId", "dossierId", "checkpoint", "status");
CREATE INDEX "DossierCheckpointEvidence_dossierId_vehicleId_checkpoint_st_idx"
  ON "DossierCheckpointEvidence"("dossierId", "vehicleId", "checkpoint", "status");
CREATE INDEX "DossierCheckpointEvidence_fileId_idx" ON "DossierCheckpointEvidence"("fileId");

CREATE TABLE "IntegrationConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "displayName" TEXT,
  "baseUrl" TEXT,
  "publicIdentifiers" JSONB,
  "encryptedCredentials" TEXT,
  "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "webhookLastEventAt" TIMESTAMP(3),
  "webhookLastStatus" TEXT,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IntegrationConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IntegrationConfig_organizationId_kind_key" ON "IntegrationConfig"("organizationId", "kind");
CREATE INDEX "IntegrationConfig_organizationId_enabled_idx" ON "IntegrationConfig"("organizationId", "enabled");

INSERT INTO "Permission" ("id", "resource", "action", "description")
VALUES
  (gen_random_uuid(), 'integrations', 'manage', 'Manage encrypted provider integration settings'),
  (gen_random_uuid(), 'clients', 'identityReveal', 'Reveal protected client identity fields')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
  ON (permission."resource" = 'integrations' AND permission."action" = 'manage')
  OR (permission."resource" = 'clients' AND permission."action" = 'identityReveal')
WHERE lower(role."name") IN ('admin', 'administrateur', 'super admin')
ON CONFLICT DO NOTHING;
