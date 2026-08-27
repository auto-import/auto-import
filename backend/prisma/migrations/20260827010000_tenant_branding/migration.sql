-- Tenant branding is organization-owned and references the existing private file authority.
CREATE TABLE "OrganizationBrandingLogo" (
    "organizationId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrganizationBrandingLogo_pkey" PRIMARY KEY ("organizationId")
);

CREATE UNIQUE INDEX "OrganizationBrandingLogo_fileId_key"
ON "OrganizationBrandingLogo"("fileId");

CREATE INDEX "OrganizationBrandingLogo_updatedAt_idx"
ON "OrganizationBrandingLogo"("updatedAt");

ALTER TABLE "OrganizationBrandingLogo"
ADD CONSTRAINT "OrganizationBrandingLogo_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationBrandingLogo"
ADD CONSTRAINT "OrganizationBrandingLogo_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
