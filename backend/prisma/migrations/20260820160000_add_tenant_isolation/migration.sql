-- Phase 3-5: Add organizationId to core business entities for tenant isolation
-- Strategy: Add nullable columns, backfill from first org, then make required

-- Step 1: Add nullable organizationId columns
ALTER TABLE "Prospect" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Client" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Dossier" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Order" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "VehicleRequest" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Partner" ADD COLUMN "organizationId" TEXT;

-- Step 2: Backfill from the first organization (existing single-tenant data)
UPDATE "Prospect" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "Client" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "Vehicle" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "Dossier" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "Order" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "VehicleRequest" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;
UPDATE "Partner" SET "organizationId" = (SELECT id FROM "Organization" LIMIT 1) WHERE "organizationId" IS NULL;

-- Step 3: Make columns NOT NULL
ALTER TABLE "Prospect" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Dossier" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "VehicleRequest" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Partner" ALTER COLUMN "organizationId" SET NOT NULL;

-- Step 4: Add foreign key constraints
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VehicleRequest" ADD CONSTRAINT "VehicleRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 5: Add indexes for query performance
CREATE INDEX "Prospect_organizationId_idx" ON "Prospect"("organizationId");
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");
CREATE INDEX "Vehicle_organizationId_idx" ON "Vehicle"("organizationId");
CREATE INDEX "Dossier_organizationId_idx" ON "Dossier"("organizationId");
CREATE INDEX "Order_organizationId_idx" ON "Order"("organizationId");
CREATE INDEX "VehicleRequest_organizationId_idx" ON "VehicleRequest"("organizationId");
CREATE INDEX "Partner_organizationId_idx" ON "Partner"("organizationId");
