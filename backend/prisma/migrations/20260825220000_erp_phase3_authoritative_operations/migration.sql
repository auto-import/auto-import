-- Phase 3 tenant ownership, operational work queues and persisted settings.
ALTER TABLE "Task" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'follow_up';
ALTER TABLE "Task" ADD COLUMN "notes" TEXT;
ALTER TABLE "Task" ADD COLUMN "dossierId" TEXT;

ALTER TABLE "NotificationTemplate" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "Notification" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "Notification" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'info';
ALTER TABLE "Notification" ADD COLUMN "entityUrl" TEXT;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;

UPDATE "Notification" AS notification
SET "organizationId" = app_user."organizationId"
FROM "User" AS app_user
WHERE app_user."id" = notification."userId";

DO $$
DECLARE
  unresolved_count INTEGER;
  unresolved_ids TEXT;
BEGIN
  SELECT COUNT(*), STRING_AGG("id"::TEXT, ', ' ORDER BY "id")
  INTO unresolved_count, unresolved_ids
  FROM "Notification"
  WHERE "organizationId" IS NULL;

  IF unresolved_count > 0 THEN
    RAISE EXCEPTION 'Phase 3 Notification ownership backfill failed: unresolved_count=%, ids=[%]', unresolved_count, unresolved_ids;
  END IF;
END $$;

ALTER TABLE "Notification" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AuditLog" ADD COLUMN "correlationId" TEXT;

CREATE TABLE "OrganizationSettings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "displayName" TEXT,
  "legalName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'fr-DZ',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Algiers',
  "baseCurrency" TEXT NOT NULL DEFAULT 'DZD',
  "dossierPrefix" TEXT NOT NULL DEFAULT 'CA',
  "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC',
  "notificationDefaults" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");
CREATE INDEX "OrganizationSettings_baseCurrency_idx" ON "OrganizationSettings"("baseCurrency");
CREATE INDEX "Task_dossierId_status_dueDate_idx" ON "Task"("dossierId", "status", "dueDate");
CREATE INDEX "Task_organizationId_type_dueDate_idx" ON "Task"("organizationId", "type", "dueDate");
CREATE INDEX "NotificationTemplate_organizationId_eventType_active_idx" ON "NotificationTemplate"("organizationId", "eventType", "active");
CREATE INDEX "Notification_organizationId_userId_readAt_createdAt_idx" ON "Notification"("organizationId", "userId", "readAt", "createdAt");
CREATE UNIQUE INDEX "Notification_organizationId_userId_dedupeKey_key" ON "Notification"("organizationId", "userId", "dedupeKey");

ALTER TABLE "Task" ADD CONSTRAINT "Task_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
