-- ERP V2 Phase 1 CRM reconciliation report.
-- READ ONLY: this script changes neither data nor schema and never prints a
-- telephone number. Run after erp-v2-preflight-readonly.sql and before any
-- future approval to add stricter phone constraints.
BEGIN TRANSACTION READ ONLY;

WITH owners AS (
  SELECT "organizationId", "phoneNormalized", 'lead' owner_type, id owner_id
  FROM "Prospect"
  WHERE "phoneNormalized" IS NOT NULL AND "archivedAt" IS NULL
  UNION ALL
  SELECT "organizationId", "phoneNormalized", 'client', id
  FROM "Client"
  WHERE "phoneNormalized" IS NOT NULL AND "archivedAt" IS NULL
), conflicts AS (
  SELECT "organizationId", "phoneNormalized",
         count(*) owner_count,
         count(*) FILTER (WHERE owner_type = 'lead') lead_count,
         count(*) FILTER (WHERE owner_type = 'client') client_count
  FROM owners
  GROUP BY "organizationId", "phoneNormalized"
  HAVING count(*) > 1
)
SELECT "organizationId",
       md5("organizationId" || ':' || "phoneNormalized") phone_fingerprint,
       owner_count, lead_count, client_count
FROM conflicts
ORDER BY "organizationId", phone_fingerprint;

SELECT "organizationId",
       count(*) FILTER (WHERE "phone" IS NOT NULL AND "phoneNormalized" IS NULL) invalid_or_unmapped_phone,
       count(*) FILTER (WHERE "crmStatus" IS NULL) unmapped_crm_status,
       count(*) FILTER (WHERE "reconciliationRequired") reconciliation_required,
       count(*) FILTER (WHERE "source" IS NOT NULL AND "legacySource" IS NULL) source_not_preserved,
       count(*) FILTER (WHERE "entryChannelId" IS NULL) missing_entry_channel,
       count(*) FILTER (WHERE "marketingSourceId" IS NULL) missing_marketing_source
FROM "Prospect"
GROUP BY "organizationId"
ORDER BY "organizationId";

SELECT reference."organizationId", reference.kind, reference.code, count(*) duplicate_count
FROM "CrmReferenceValue" reference
GROUP BY reference."organizationId", reference.kind, reference.code
HAVING count(*) > 1;

SELECT client."organizationId", count(*) missing_conversion_lineage
FROM "Client" client
WHERE client."prospectId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ProspectConversion" conversion
    WHERE conversion."prospectId" = client."prospectId"
      AND conversion."clientId" = client.id
      AND conversion."organizationId" = client."organizationId"
  )
GROUP BY client."organizationId";

SELECT contact."organizationId", count(*) invalid_owner_links
FROM "ContactPoint" contact
WHERE contact."prospectId" IS NULL AND contact."clientId" IS NULL
GROUP BY contact."organizationId";

SELECT task."organizationId", task."automationKey", count(*) duplicate_automation_tasks
FROM "Task" task
WHERE task."automationKey" IS NOT NULL
GROUP BY task."organizationId", task."automationKey"
HAVING count(*) > 1;

ROLLBACK;
