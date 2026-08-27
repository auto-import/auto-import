-- CreateEnum
CREATE TYPE "LeadQualification" AS ENUM ('HOT', 'WARM', 'COLD', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "ContactPointKind" AS ENUM ('PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "CompanyChannelKind" AS ENUM ('VOICE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallState" AS ENUM ('RINGING', 'QUEUED', 'ASSIGNED', 'FORWARDED', 'ANSWERED', 'COMPLETED', 'MISSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CallAssignmentStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentPresenceStatus" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "PresenceSource" AS ENUM ('MANUAL', 'PROVIDER');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('RECEIVED', 'SIMULATED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "lastInteractionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAt" TIMESTAMP(3),
ADD COLUMN     "qualification" "LeadQualification" NOT NULL DEFAULT 'UNCLASSIFIED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "callbackForCallId" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "prospectId" TEXT;

-- CreateTable
CREATE TABLE "ContactPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ContactPointKind" NOT NULL,
    "displayValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "prospectId" TEXT,
    "clientId" TEXT,
    "preferred" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "CompanyChannelKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "queueName" TEXT NOT NULL DEFAULT 'default',
    "routingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerCallId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "companyNumber" TEXT NOT NULL,
    "externalNumber" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "dispatcherId" TEXT,
    "handlingEmployeeId" TEXT,
    "state" "CallState" NOT NULL DEFAULT 'RINGING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "waitingSeconds" INTEGER,
    "outcome" TEXT,
    "notes" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "missedReason" TEXT,
    "failureReason" TEXT,
    "dispositionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "providerEventId" TEXT,
    "state" "CallState" NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAssignment" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "dispatcherId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "status" "CallAssignmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CallAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPresence" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentPresenceStatus" NOT NULL DEFAULT 'OFFLINE',
    "source" "PresenceSource" NOT NULL DEFAULT 'MANUAL',
    "currentCallId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerConversationId" TEXT,
    "externalNumber" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "assignedTo" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "contentType" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "text" TEXT,
    "status" "MessageDeliveryStatus" NOT NULL,
    "replyToId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prospectId" TEXT,
    "clientId" TEXT,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "changedBy" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookInbox" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookInbox_pkey" PRIMARY KEY ("id")
);

-- Backfill canonical contact identities. Converted prospects are represented by
-- their client so the same human is not treated as a duplicate owner.
CREATE TEMP TABLE "_crm_contact_backfill" AS
WITH raw_contacts AS (
    SELECT c."organizationId", 'PHONE'::"ContactPointKind" AS kind,
           c.phone AS "displayValue",
           CASE
             WHEN regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '00%' THEN '+' || substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 3)
             WHEN regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '213%' THEN '+' || regexp_replace(c.phone, '[^0-9]', '', 'g')
             WHEN regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '0%' THEN '+213' || substring(regexp_replace(c.phone, '[^0-9]', '', 'g') FROM 2)
             ELSE '+' || regexp_replace(c.phone, '[^0-9]', '', 'g')
           END AS "normalizedValue",
           NULL::TEXT AS "prospectId", c.id AS "clientId", 'client:' || c.id AS owner
    FROM "Client" c WHERE c.phone IS NOT NULL AND btrim(c.phone) <> ''
    UNION ALL
    SELECT c."organizationId", 'EMAIL'::"ContactPointKind", c.email,
           lower(btrim(c.email)), NULL::TEXT, c.id, 'client:' || c.id
    FROM "Client" c WHERE c.email IS NOT NULL AND btrim(c.email) <> ''
    UNION ALL
    SELECT p."organizationId", 'PHONE'::"ContactPointKind", p.phone,
           CASE
             WHEN regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE '00%' THEN '+' || substring(regexp_replace(p.phone, '[^0-9]', '', 'g') FROM 3)
             WHEN regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE '213%' THEN '+' || regexp_replace(p.phone, '[^0-9]', '', 'g')
             WHEN regexp_replace(p.phone, '[^0-9]', '', 'g') LIKE '0%' THEN '+213' || substring(regexp_replace(p.phone, '[^0-9]', '', 'g') FROM 2)
             ELSE '+' || regexp_replace(p.phone, '[^0-9]', '', 'g')
           END,
           p.id, NULL::TEXT, 'prospect:' || p.id
    FROM "Prospect" p
    WHERE p.phone IS NOT NULL AND btrim(p.phone) <> ''
      AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."prospectId" = p.id)
    UNION ALL
    SELECT p."organizationId", 'EMAIL'::"ContactPointKind", p.email,
           lower(btrim(p.email)), p.id, NULL::TEXT, 'prospect:' || p.id
    FROM "Prospect" p
    WHERE p.email IS NOT NULL AND btrim(p.email) <> ''
      AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."prospectId" = p.id)
)
SELECT * FROM raw_contacts
WHERE "normalizedValue" IS NOT NULL AND "normalizedValue" NOT IN ('', '+');

DO $$
DECLARE contact_conflicts TEXT;
BEGIN
  SELECT string_agg(format('%s %s %s => %s', "organizationId", kind, "normalizedValue", owners), E'\n')
  INTO contact_conflicts
  FROM (
    SELECT "organizationId", kind, "normalizedValue", string_agg(DISTINCT owner, ', ') AS owners
    FROM "_crm_contact_backfill"
    GROUP BY "organizationId", kind, "normalizedValue"
    HAVING count(DISTINCT owner) > 1
  ) conflicts;

  IF contact_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'CRM contact backfill has ambiguous tenant-scoped ownership:%', E'\n' || contact_conflicts;
  END IF;
END $$;

INSERT INTO "ContactPoint" (
  id, "organizationId", kind, "displayValue", "normalizedValue",
  "whatsappEnabled", "prospectId", "clientId", preferred, verified,
  "createdAt", "updatedAt"
)
SELECT gen_random_uuid()::TEXT, "organizationId", kind, min("displayValue"),
       "normalizedValue", kind = 'PHONE'::"ContactPointKind",
       min("prospectId"), min("clientId"), true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_crm_contact_backfill"
GROUP BY "organizationId", kind, "normalizedValue", owner;

DROP TABLE "_crm_contact_backfill";

UPDATE "Client" c
SET "assignedTo" = p."assignedTo"
FROM "Prospect" p
WHERE c."prospectId" = p.id AND c."assignedTo" IS NULL;

UPDATE "Prospect" p
SET "lastInteractionAt" = latest."activityDate"
FROM (
  SELECT "prospectId", max("activityDate") AS "activityDate"
  FROM "ProspectActivity" GROUP BY "prospectId"
) latest
WHERE latest."prospectId" = p.id;

UPDATE "Client" c
SET "lastInteractionAt" = p."lastInteractionAt"
FROM "Prospect" p
WHERE c."prospectId" = p.id;

ALTER TABLE "ContactPoint"
  ADD CONSTRAINT "ContactPoint_exactly_one_owner_check"
  CHECK (("prospectId" IS NOT NULL)::int + ("clientId" IS NOT NULL)::int = 1);

ALTER TABLE "CallSession"
  ADD CONSTRAINT "CallSession_at_most_one_contact_check"
  CHECK (NOT ("prospectId" IS NOT NULL AND "clientId" IS NOT NULL));

ALTER TABLE "WhatsappConversation"
  ADD CONSTRAINT "WhatsappConversation_at_most_one_contact_check"
  CHECK (NOT ("prospectId" IS NOT NULL AND "clientId" IS NOT NULL));

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_exactly_one_contact_check"
  CHECK (("prospectId" IS NOT NULL)::int + ("clientId" IS NOT NULL)::int = 1),
  ADD CONSTRAINT "Appointment_time_order_check"
  CHECK ("scheduledEnd" > "scheduledStart");

ALTER TABLE "CrmNote"
  ADD CONSTRAINT "CrmNote_exactly_one_contact_check"
  CHECK (("prospectId" IS NOT NULL)::int + ("clientId" IS NOT NULL)::int = 1);

-- CreateIndex
CREATE INDEX "ContactPoint_prospectId_idx" ON "ContactPoint"("prospectId");

-- CreateIndex
CREATE INDEX "ContactPoint_clientId_idx" ON "ContactPoint"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPoint_organizationId_kind_normalizedValue_key" ON "ContactPoint"("organizationId", "kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "CompanyChannel_normalizedNumber_channel_active_idx" ON "CompanyChannel"("normalizedNumber", "channel", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyChannel_organizationId_channel_normalizedNumber_key" ON "CompanyChannel"("organizationId", "channel", "normalizedNumber");

-- Provider-facing company numbers must resolve to exactly one tenant.
CREATE UNIQUE INDEX "CompanyChannel_providerKey_channel_normalizedNumber_key" ON "CompanyChannel"("providerKey", "channel", "normalizedNumber");

-- CreateIndex
CREATE INDEX "CallSession_organizationId_state_queuedAt_idx" ON "CallSession"("organizationId", "state", "queuedAt");

-- CreateIndex
CREATE INDEX "CallSession_organizationId_handlingEmployeeId_receivedAt_idx" ON "CallSession"("organizationId", "handlingEmployeeId", "receivedAt");

-- CreateIndex
CREATE INDEX "CallSession_prospectId_receivedAt_idx" ON "CallSession"("prospectId", "receivedAt");

-- CreateIndex
CREATE INDEX "CallSession_clientId_receivedAt_idx" ON "CallSession"("clientId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_organizationId_providerKey_providerCallId_key" ON "CallSession"("organizationId", "providerKey", "providerCallId");

-- CreateIndex
CREATE INDEX "CallEvent_callSessionId_occurredAt_id_idx" ON "CallEvent"("callSessionId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CallEvent_callSessionId_providerEventId_key" ON "CallEvent"("callSessionId", "providerEventId");

-- CreateIndex
CREATE INDEX "CallAssignment_callSessionId_requestedAt_idx" ON "CallAssignment"("callSessionId", "requestedAt");

-- CreateIndex
CREATE INDEX "CallAssignment_toUserId_status_idx" ON "CallAssignment"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPresence_userId_key" ON "AgentPresence"("userId");

-- CreateIndex
CREATE INDEX "AgentPresence_organizationId_status_lastHeartbeatAt_idx" ON "AgentPresence"("organizationId", "status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_organizationId_lastMessageAt_idx" ON "WhatsappConversation"("organizationId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsappConversation_prospectId_idx" ON "WhatsappConversation"("prospectId");

-- CreateIndex
CREATE INDEX "WhatsappConversation_clientId_idx" ON "WhatsappConversation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappConversation_organizationId_channelId_externalNumbe_key" ON "WhatsappConversation"("organizationId", "channelId", "externalNumber");

-- CreateIndex
CREATE INDEX "WhatsappMessage_conversationId_occurredAt_id_idx" ON "WhatsappMessage"("conversationId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_organizationId_providerKey_providerMessageI_key" ON "WhatsappMessage"("organizationId", "providerKey", "providerMessageId");

-- CreateIndex
CREATE INDEX "Appointment_organizationId_assignedTo_scheduledStart_idx" ON "Appointment"("organizationId", "assignedTo", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_prospectId_scheduledStart_idx" ON "Appointment"("prospectId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_clientId_scheduledStart_idx" ON "Appointment"("clientId", "scheduledStart");

-- CreateIndex
CREATE INDEX "CrmNote_prospectId_occurredAt_id_idx" ON "CrmNote"("prospectId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "CrmNote_clientId_occurredAt_id_idx" ON "CrmNote"("clientId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "ProspectStatusHistory_prospectId_occurredAt_id_idx" ON "ProspectStatusHistory"("prospectId", "occurredAt", "id");

-- CreateIndex
CREATE INDEX "ProspectStatusHistory_organizationId_occurredAt_idx" ON "ProspectStatusHistory"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "WebhookInbox_status_receivedAt_idx" ON "WebhookInbox"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookInbox_channelId_receivedAt_idx" ON "WebhookInbox"("channelId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookInbox_organizationId_providerKey_providerEventId_key" ON "WebhookInbox"("organizationId", "providerKey", "providerEventId");

-- CreateIndex
CREATE INDEX "Client_organizationId_assignedTo_idx" ON "Client"("organizationId", "assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "Task_callbackForCallId_key" ON "Task"("callbackForCallId");

-- CreateIndex
CREATE INDEX "Task_prospectId_status_dueDate_idx" ON "Task"("prospectId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_clientId_status_dueDate_idx" ON "Task"("clientId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyChannel" ADD CONSTRAINT "CompanyChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CompanyChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_handlingEmployeeId_fkey" FOREIGN KEY ("handlingEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAssignment" ADD CONSTRAINT "CallAssignment_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPresence" ADD CONSTRAINT "AgentPresence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPresence" ADD CONSTRAINT "AgentPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPresence" ADD CONSTRAINT "AgentPresence_currentCallId_fkey" FOREIGN KEY ("currentCallId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CompanyChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConversation" ADD CONSTRAINT "WhatsappConversation_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "WhatsappMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmNote" ADD CONSTRAINT "CrmNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookInbox" ADD CONSTRAINT "WebhookInbox_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookInbox" ADD CONSTRAINT "WebhookInbox_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CompanyChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WhatsappConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_callbackForCallId_fkey" FOREIGN KEY ("callbackForCallId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
