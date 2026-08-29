-- ERP V2 Phase 1: additive CRM Leads and Clients expansion.
-- This migration intentionally keeps legacy Prospect.source/status and
-- Client.prospectId as compatibility projections. No business row is removed.

CREATE TABLE "CrmReferenceValue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "labelFr" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmReferenceValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmReferenceValue_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CrmReferenceValue_organizationId_kind_code_key"
  ON "CrmReferenceValue"("organizationId", "kind", "code");
CREATE INDEX "CrmReferenceValue_organizationId_kind_active_sortOrder_idx"
  ON "CrmReferenceValue"("organizationId", "kind", "active", "sortOrder");

INSERT INTO "CrmReferenceValue"
  ("id", "organizationId", "kind", "code", "labelFr", "sortOrder", "metadata", "updatedAt")
SELECT gen_random_uuid()::text, organization."id", defaults.kind, defaults.code,
       defaults.label, defaults.position, defaults.metadata::jsonb, CURRENT_TIMESTAMP
FROM "Organization" organization
CROSS JOIN (VALUES
  ('ENTRY_CHANNEL', 'INCOMING_CALL', 'Appel entrant', 10, NULL),
  ('ENTRY_CHANNEL', 'WHATSAPP', 'WhatsApp', 20, NULL),
  ('ENTRY_CHANNEL', 'WEBSITE', 'Site web', 30, NULL),
  ('ENTRY_CHANNEL', 'MANUAL', 'Saisie manuelle', 40, NULL),
  ('MARKETING_SOURCE', 'FACEBOOK_ADS', 'Facebook Ads', 10, NULL),
  ('MARKETING_SOURCE', 'INSTAGRAM', 'Instagram', 20, NULL),
  ('MARKETING_SOURCE', 'TIKTOK', 'TikTok', 30, NULL),
  ('MARKETING_SOURCE', 'RECOMMENDATION', 'Recommandation', 40, NULL),
  ('MARKETING_SOURCE', 'OFFICE_VISIT', 'Visite au bureau', 50, NULL),
  ('MARKETING_SOURCE', 'OTHER', 'Autre', 60, NULL),
  ('COUNTRY', 'DZ', 'Algérie', 10, '{"callingCode":"213","nationalLengths":[9],"nationalityLabel":"Algérienne","defaultForPhone":true}'),
  ('COUNTRY', 'CN', 'Chine', 20, '{"callingCode":"86","nationalLengths":[11],"nationalityLabel":"Chinoise"}'),
  ('COUNTRY', 'FR', 'France', 30, '{"callingCode":"33","nationalLengths":[9],"nationalityLabel":"Française"}'),
  ('COUNTRY', 'OTHER', 'Autre', 999, '{}')
) AS defaults(kind, code, label, position, metadata)
ON CONFLICT ("organizationId", "kind", "code") DO NOTHING;

ALTER TABLE "Prospect"
  ADD COLUMN "phoneNormalized" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "legacySource" TEXT,
  ADD COLUMN "entryChannelId" TEXT,
  ADD COLUMN "marketingSourceId" TEXT,
  ADD COLUMN "countryId" TEXT,
  ADD COLUMN "crmStatus" TEXT,
  ADD COLUMN "crmOutcome" TEXT,
  ADD COLUMN "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "Client"
  ADD COLUMN "phoneNormalized" TEXT,
  ADD COLUMN "countryId" TEXT,
  ADD COLUMN "nationalityCountryId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "archiveReason" TEXT;

ALTER TABLE "Task" ADD COLUMN "automationKey" TEXT;

UPDATE "Prospect" SET "legacySource" = "source" WHERE "legacySource" IS NULL;

UPDATE "Prospect" prospect
SET "entryChannelId" = reference."id"
FROM "CrmReferenceValue" reference
WHERE reference."organizationId" = prospect."organizationId"
  AND reference."kind" = 'ENTRY_CHANNEL'
  AND reference."code" = CASE upper(coalesce(prospect."source", ''))
    WHEN 'INBOUND_CALL' THEN 'INCOMING_CALL'
    WHEN 'INCOMING_CALL' THEN 'INCOMING_CALL'
    WHEN 'WHATSAPP' THEN 'WHATSAPP'
    WHEN 'WEBSITE' THEN 'WEBSITE'
    WHEN 'MANUAL' THEN 'MANUAL'
    ELSE NULL
  END;

UPDATE "Prospect" prospect
SET "marketingSourceId" = reference."id"
FROM "CrmReferenceValue" reference
WHERE reference."organizationId" = prospect."organizationId"
  AND reference."kind" = 'MARKETING_SOURCE'
  AND reference."code" = CASE upper(replace(coalesce(prospect."source", ''), ' ', '_'))
    WHEN 'FACEBOOK' THEN 'FACEBOOK_ADS'
    WHEN 'FACEBOOK_ADS' THEN 'FACEBOOK_ADS'
    WHEN 'INSTAGRAM' THEN 'INSTAGRAM'
    WHEN 'TIKTOK' THEN 'TIKTOK'
    WHEN 'REFERRAL' THEN 'RECOMMENDATION'
    WHEN 'RECOMMENDATION' THEN 'RECOMMENDATION'
    WHEN 'OFFICE_VISIT' THEN 'OFFICE_VISIT'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE NULL
  END;

UPDATE "Prospect"
SET "crmStatus" = CASE "status"
  WHEN 'new' THEN 'NEW'
  WHEN 'contacted' THEN 'CONTACTED'
  WHEN 'interested' THEN 'QUALIFIED'
  WHEN 'qualified' THEN 'QUALIFIED'
  WHEN 'offerSent' THEN 'QUALIFIED'
  WHEN 'negotiating' THEN 'QUALIFIED'
  WHEN 'won' THEN 'CONTRACT'
  WHEN 'converted' THEN 'CONVERTED'
  ELSE NULL
END,
"crmOutcome" = CASE WHEN "status" = 'lost' THEN 'LOST' ELSE NULL END,
"reconciliationRequired" = CASE
  WHEN "status" = 'lost' OR "status" NOT IN
    ('new','contacted','interested','qualified','offerSent','negotiating','won','converted')
  THEN true ELSE false END;

WITH normalized AS (
  SELECT "id", regexp_replace("phone", '[^0-9]', '', 'g') digits
  FROM "Prospect" WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
)
UPDATE "Prospect" prospect
SET "phoneNormalized" = CASE
  WHEN normalized.digits LIKE '00%' THEN '+' || substring(normalized.digits FROM 3)
  WHEN normalized.digits LIKE '213%' THEN '+' || normalized.digits
  WHEN normalized.digits LIKE '0%' THEN '+213' || substring(normalized.digits FROM 2)
  WHEN length(normalized.digits) = 9 THEN '+213' || normalized.digits
  ELSE '+' || normalized.digits
END
FROM normalized
WHERE prospect."id" = normalized."id"
  AND length(CASE WHEN normalized.digits LIKE '00%' THEN substring(normalized.digits FROM 3) ELSE normalized.digits END) BETWEEN 8 AND 15;

WITH normalized AS (
  SELECT "id", regexp_replace("phone", '[^0-9]', '', 'g') digits
  FROM "Client" WHERE "phone" IS NOT NULL AND btrim("phone") <> ''
)
UPDATE "Client" client
SET "phoneNormalized" = CASE
  WHEN normalized.digits LIKE '00%' THEN '+' || substring(normalized.digits FROM 3)
  WHEN normalized.digits LIKE '213%' THEN '+' || normalized.digits
  WHEN normalized.digits LIKE '0%' THEN '+213' || substring(normalized.digits FROM 2)
  WHEN length(normalized.digits) = 9 THEN '+213' || normalized.digits
  ELSE '+' || normalized.digits
END
FROM normalized
WHERE client."id" = normalized."id"
  AND length(CASE WHEN normalized.digits LIKE '00%' THEN substring(normalized.digits FROM 3) ELSE normalized.digits END) BETWEEN 8 AND 15;

UPDATE "Prospect" prospect
SET "reconciliationRequired" = true
WHERE prospect."phone" IS NOT NULL AND prospect."phoneNormalized" IS NULL;

UPDATE "Prospect"
SET "reconciliationRequired" = true
WHERE "entryChannelId" IS NULL OR "marketingSourceId" IS NULL;

UPDATE "Client" client
SET "nationalityCountryId" = reference."id"
FROM "CrmReferenceValue" reference
WHERE reference."organizationId" = client."organizationId"
  AND reference."kind" = 'COUNTRY'
  AND upper(coalesce(client."nationality", '')) IN ('DZ','DZA','ALGERIA','ALGERIE','ALGÉRIE')
  AND reference."code" = 'DZ';

ALTER TABLE "Prospect"
  ADD CONSTRAINT "Prospect_entryChannelId_fkey" FOREIGN KEY ("entryChannelId") REFERENCES "CrmReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Prospect_marketingSourceId_fkey" FOREIGN KEY ("marketingSourceId") REFERENCES "CrmReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Prospect_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CrmReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Prospect_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CrmReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Client_nationalityCountryId_fkey" FOREIGN KEY ("nationalityCountryId") REFERENCES "CrmReferenceValue"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Client_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Prospect_organizationId_crmStatus_createdAt_idx" ON "Prospect"("organizationId", "crmStatus", "createdAt");
CREATE INDEX "Prospect_organizationId_qualification_createdAt_idx" ON "Prospect"("organizationId", "qualification", "createdAt");
CREATE INDEX "Prospect_organizationId_entryChannelId_createdAt_idx" ON "Prospect"("organizationId", "entryChannelId", "createdAt");
CREATE INDEX "Prospect_organizationId_marketingSourceId_createdAt_idx" ON "Prospect"("organizationId", "marketingSourceId", "createdAt");
CREATE INDEX "Prospect_organizationId_nextActionAt_idx" ON "Prospect"("organizationId", "nextActionAt");
CREATE INDEX "Prospect_organizationId_phoneNormalized_idx" ON "Prospect"("organizationId", "phoneNormalized");
CREATE INDEX "Prospect_archivedById_idx" ON "Prospect"("archivedById");
CREATE INDEX "Client_organizationId_phoneNormalized_idx" ON "Client"("organizationId", "phoneNormalized");
CREATE INDEX "Client_organizationId_status_createdAt_idx" ON "Client"("organizationId", "status", "createdAt");
CREATE INDEX "Client_archivedById_idx" ON "Client"("archivedById");
CREATE UNIQUE INDEX "Task_organizationId_automationKey_key" ON "Task"("organizationId", "automationKey");

CREATE TABLE "ProspectConversion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "convertedBy" TEXT,
  "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspectConversion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProspectConversion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProspectConversion_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProspectConversion_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProspectConversion_convertedBy_fkey" FOREIGN KEY ("convertedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProspectConversion_prospectId_key" ON "ProspectConversion"("prospectId");
CREATE INDEX "ProspectConversion_organizationId_clientId_convertedAt_idx" ON "ProspectConversion"("organizationId", "clientId", "convertedAt");
CREATE INDEX "ProspectConversion_convertedBy_idx" ON "ProspectConversion"("convertedBy");

INSERT INTO "ProspectConversion" ("id", "organizationId", "prospectId", "clientId", "convertedAt")
SELECT gen_random_uuid()::text, client."organizationId", client."prospectId", client."id",
       coalesce(prospect."convertedAt", client."createdAt")
FROM "Client" client
JOIN "Prospect" prospect ON prospect."id" = client."prospectId"
WHERE client."prospectId" IS NOT NULL
ON CONFLICT ("prospectId") DO NOTHING;

-- Phase 1 allows one canonical contact point to retain both lead and client
-- lineage after conversion. It must always keep at least one owner.
ALTER TABLE "ContactPoint" DROP CONSTRAINT IF EXISTS "ContactPoint_exactly_one_owner_check";
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_at_least_one_owner_check"
  CHECK ("prospectId" IS NOT NULL OR "clientId" IS NOT NULL) NOT VALID;
ALTER TABLE "ContactPoint" VALIDATE CONSTRAINT "ContactPoint_at_least_one_owner_check";

INSERT INTO "Permission" ("id", "resource", "action", "description") VALUES
  (gen_random_uuid(), 'prospects', 'transition', 'Transition the V2 CRM lead workflow'),
  (gen_random_uuid(), 'prospects', 'convert', 'Convert a CRM lead to a client'),
  (gen_random_uuid(), 'prospects', 'archive', 'Archive CRM leads'),
  (gen_random_uuid(), 'clients', 'identityWrite', 'Create or update restricted client identity data'),
  (gen_random_uuid(), 'clients', 'archive', 'Archive clients'),
  (gen_random_uuid(), 'crmReference', 'read', 'Read tenant CRM channels, sources and countries'),
  (gen_random_uuid(), 'crmReference', 'manage', 'Manage CRM channels, sources and countries')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT DISTINCT role_permission."roleId", target."id"
FROM "RolePermission" role_permission
JOIN "Permission" current_permission ON current_permission."id" = role_permission."permissionId"
JOIN "Permission" target ON
  (current_permission."resource" = 'prospects' AND current_permission."action" = 'write'
    AND target."resource" = 'prospects' AND target."action" IN ('transition','convert'))
  OR (current_permission."resource" = 'clients' AND current_permission."action" = 'write'
    AND target."resource" = 'clients' AND target."action" = 'identityWrite')
  OR (current_permission."resource" = 'settings' AND current_permission."action" IN ('write','manage')
    AND target."resource" = 'crmReference' AND target."action" IN ('read','manage'))
  OR (current_permission."resource" IN ('prospects','clients') AND current_permission."action" = 'read'
    AND target."resource" = 'crmReference' AND target."action" = 'read')
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE lower(role."name") IN ('admin', 'administrateur', 'super admin', 'direction')
  AND ((permission."resource" = 'prospects' AND permission."action" = 'archive')
    OR (permission."resource" = 'clients' AND permission."action" = 'archive'))
ON CONFLICT DO NOTHING;

-- Conflict reporting remains read-only and operator-controlled. No uniqueness
-- is added to the nullable compatibility phone projections in this migration.
