\set ON_ERROR_STOP on
\pset pager off

-- ERP V2 production-data preflight.
-- This script is intentionally SELECT-only and does not expose raw phone numbers,
-- identity values, filenames, storage keys, URLs, document contents, or bank data.
-- Run with a database role that has CONNECT and SELECT only.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5min';
SET LOCAL lock_timeout = '5s';

SELECT current_database() AS database_name,
       current_user AS database_user,
       pg_is_in_recovery() AS is_replica,
       setting AS transaction_read_only
FROM pg_settings
WHERE name = 'transaction_read_only';

-- CRM source/status inventory. Values are grouped so no person data is returned.
SELECT 'crm.prospect_source' AS report,
       CASE
         WHEN "source" IS NULL THEN '<null>'
         WHEN upper("source") IN (
           'MANUAL', 'INBOUND_CALL', 'WHATSAPP', 'WEBSITE', 'REFERRAL',
           'FACEBOOK ADS', 'INSTAGRAM', 'TIKTOK', 'RECOMMENDATION',
           'OFFICE VISIT', 'OTHER'
         ) THEN upper("source")
         ELSE '<unknown-nonempty>'
       END AS value,
       count(*) AS row_count
FROM "Prospect"
GROUP BY value
ORDER BY row_count DESC, value;

SELECT 'crm.prospect_status' AS report,
       "status" AS value,
       count(*) AS row_count
FROM "Prospect"
GROUP BY "status"
ORDER BY row_count DESC, value;

-- Duplicate shapes are aggregated without printing or fingerprinting a phone.
WITH raw_phones AS (
  SELECT "organizationId", 'prospect'::text AS owner_type, "id" AS owner_id,
         regexp_replace(COALESCE("phone", ''), '[^0-9]+', '', 'g') AS digits
  FROM "Prospect"
  WHERE NULLIF(btrim(COALESCE("phone", '')), '') IS NOT NULL
  UNION ALL
  SELECT "organizationId", 'client', "id",
         regexp_replace(COALESCE("phone", ''), '[^0-9]+', '', 'g')
  FROM "Client"
  WHERE NULLIF(btrim(COALESCE("phone", '')), '') IS NOT NULL
), normalized AS (
  SELECT "organizationId", owner_type, owner_id,
         CASE
           WHEN digits LIKE '00213%' THEN substring(digits FROM 3)
           WHEN digits LIKE '213%' THEN digits
           WHEN digits LIKE '0%' THEN '213' || substring(digits FROM 2)
           WHEN length(digits) = 9 THEN '213' || digits
           ELSE digits
         END AS canonical_digits
  FROM raw_phones
), duplicate_groups AS (
  SELECT "organizationId", canonical_digits,
         count(*) AS owner_count,
         count(*) FILTER (WHERE owner_type = 'prospect') AS prospect_count,
         count(*) FILTER (WHERE owner_type = 'client') AS client_count
  FROM normalized
  WHERE length(canonical_digits) BETWEEN 8 AND 15
  GROUP BY "organizationId", canonical_digits
  HAVING count(*) > 1
)
SELECT 'crm.raw_phone_duplicate_summary' AS report,
       owner_count,
       prospect_count,
       client_count,
       count(*) AS duplicate_groups
FROM duplicate_groups
GROUP BY owner_count, prospect_count, client_count
ORDER BY owner_count DESC, prospect_count DESC, client_count DESC;

SELECT 'crm.invalid_or_unowned_contact_points' AS report,
       count(*) FILTER (WHERE "normalizedValue" = '' OR "normalizedValue" IS NULL) AS blank_normalized,
       count(*) FILTER (WHERE "prospectId" IS NULL AND "clientId" IS NULL) AS no_owner,
       count(*) FILTER (WHERE "prospectId" IS NOT NULL AND "clientId" IS NOT NULL) AS lead_and_client_owner
FROM "ContactPoint";

SELECT 'crm.assignment_tenant_or_status_conflicts' AS report,
       count(*) FILTER (WHERE u."id" IS NULL) AS missing_assignee,
       count(*) FILTER (WHERE u."organizationId" <> p."organizationId") AS cross_tenant_assignee,
       count(*) FILTER (WHERE u."status" <> 'active') AS inactive_assignee
FROM "Prospect" p
LEFT JOIN "User" u ON u."id" = p."assignedTo"
WHERE p."assignedTo" IS NOT NULL;

SELECT 'crm.conversion_conflicts' AS report,
       count(*) FILTER (WHERE p."convertedAt" IS NOT NULL AND c."id" IS NULL) AS marked_converted_without_client,
       count(*) FILTER (WHERE c."id" IS NOT NULL AND p."convertedAt" IS NULL) AS client_link_without_converted_at,
       count(*) FILTER (WHERE c."id" IS NOT NULL AND c."organizationId" <> p."organizationId") AS cross_tenant_client
FROM "Prospect" p
LEFT JOIN "Client" c ON c."prospectId" = p."id";

-- GED/file inventory. Physical-file existence requires the separate storage-volume
-- checker planned for Phase 2; PostgreSQL cannot safely inspect that filesystem.
SELECT 'ged.asset_inventory' AS report,
       count(*) AS assets,
       count(*) FILTER (WHERE COALESCE("checksum", '') = '') AS missing_checksum,
       count(*) FILTER (WHERE "storageKey" ~* '^(https?|data):') AS unsafe_public_or_inline_key,
       count(*) FILTER (WHERE "organizationId" IS NULL) AS missing_tenant
FROM "FileAsset";

WITH asset_references AS (
  SELECT "fileId" FROM "VehiclePhoto"
  UNION ALL SELECT "fileId" FROM "OfferPhoto"
  UNION ALL SELECT "fileId" FROM "CustomsDocument"
  UNION ALL SELECT "fileId" FROM "BusinessDocument"
  UNION ALL SELECT "fileId" FROM "DossierDocumentAsset"
  UNION ALL SELECT "fileId" FROM "DossierCheckpointEvidence"
  UNION ALL SELECT "fileId" FROM "UserAvatar"
  UNION ALL SELECT "fileId" FROM "OrganizationBrandingLogo"
), counts AS (
  SELECT "fileId", count(*) AS reference_count
  FROM asset_references
  GROUP BY "fileId"
)
SELECT 'ged.asset_reference_summary' AS report,
       count(*) FILTER (WHERE c."fileId" IS NULL) AS orphaned_assets,
       count(*) FILTER (WHERE c.reference_count > 1) AS multiply_referenced_assets,
       COALESCE(sum(c.reference_count), 0) AS total_links
FROM "FileAsset" f
LEFT JOIN counts c ON c."fileId" = f."id";

SELECT 'ged.duplicate_dossier_links' AS report,
       count(*) AS duplicate_groups
FROM (
  SELECT "organizationId", "dossierId", "clientId", "fileId", "kind", COALESCE("documentType", '')
  FROM "DossierDocumentAsset"
  GROUP BY "organizationId", "dossierId", "clientId", "fileId", "kind", COALESCE("documentType", '')
  HAVING count(*) > 1
) d;

SELECT 'ged.tenant_conflicts' AS report,
       count(*) FILTER (WHERE f."organizationId" <> d."organizationId") AS asset_link_conflicts,
       count(*) FILTER (WHERE ds."id" IS NOT NULL AND ds."organizationId" <> d."organizationId") AS dossier_link_conflicts,
       count(*) FILTER (WHERE c."id" IS NOT NULL AND c."organizationId" <> d."organizationId") AS client_link_conflicts,
       count(*) FILTER (WHERE ds."id" IS NOT NULL AND c."id" IS NOT NULL AND ds."clientId" <> c."id") AS dossier_client_conflicts
FROM "DossierDocumentAsset" d
JOIN "FileAsset" f ON f."id" = d."fileId"
LEFT JOIN "Dossier" ds ON ds."id" = d."dossierId"
LEFT JOIN "Client" c ON c."id" = d."clientId";

SELECT 'ged.metadata_inventory' AS report,
       count(*) AS documents,
       count(*) FILTER (WHERE NULLIF(btrim(COALESCE("documentType", '')), '') IS NULL) AS missing_type,
       count(*) FILTER (WHERE NULLIF(btrim(COALESCE("title", '')), '') IS NULL) AS missing_title,
       count(*) FILTER (WHERE "status" NOT IN ('pending', 'valid', 'rejected', 'archived', 'expired')) AS unknown_status
FROM "DossierDocumentAsset";

SELECT 'ged.generic_business_links' AS report,
       "entityType",
       count(*) AS row_count
FROM "BusinessDocument"
GROUP BY "entityType"
ORDER BY row_count DESC, "entityType";

-- Supplier/offer conflicts and mutable price baseline.
SELECT 'supplier.relation_conflicts' AS report,
       count(*) FILTER (WHERE p."id" IS NULL) AS missing_supplier,
       count(*) FILTER (WHERE p."organizationId" <> o."organizationId") AS cross_tenant_supplier,
       count(*) FILTER (WHERE p."type" <> 'supplier') AS wrong_partner_type
FROM "ChinaOffer" o
LEFT JOIN "Partner" p ON p."id" = o."supplierId";

SELECT 'offer.status_inventory' AS report, "status", count(*) AS row_count
FROM "ChinaOffer"
GROUP BY "status"
ORDER BY row_count DESC, "status";

-- Finance source/idempotency and tenant consistency baseline.
SELECT 'finance.idempotency_inventory' AS report,
       (SELECT count(*) FROM "Payment" WHERE "idempotencyKey" IS NULL) AS payments_without_key,
       (SELECT count(*) FROM "SupplierPayment" WHERE "idempotencyKey" IS NULL) AS supplier_payments_without_key,
       (SELECT count(*) FROM "Cost") AS costs_without_source_authority;

SELECT 'finance.tenant_conflicts' AS report,
       count(*) FILTER (WHERE c."organizationId" <> p."organizationId") AS payment_client_conflicts,
       count(*) FILTER (WHERE d."id" IS NOT NULL AND d."organizationId" <> p."organizationId") AS payment_dossier_conflicts
FROM "Payment" p
JOIN "Client" c ON c."id" = p."clientId"
LEFT JOIN "Dossier" d ON d."id" = p."dossierId";

-- Shipping/customs cardinality and link-consistency baseline.
SELECT 'customs.null_cardinality' AS report,
       count(*) FILTER (WHERE "vehicleId" IS NULL) AS missing_vehicle,
       count(*) FILTER (WHERE "dossierId" IS NULL) AS missing_dossier,
       count(*) FILTER (WHERE "shipmentId" IS NULL) AS missing_shipment
FROM "CustomsFile";

SELECT 'customs.duplicate_vehicle_dossier_groups' AS report,
       count(*) AS duplicate_groups
FROM (
  SELECT "organizationId", "vehicleId", "dossierId"
  FROM "CustomsFile"
  WHERE "vehicleId" IS NOT NULL AND "dossierId" IS NOT NULL
  GROUP BY "organizationId", "vehicleId", "dossierId"
  HAVING count(*) > 1
) d;

SELECT 'customs.link_conflicts' AS report,
       count(*) FILTER (WHERE v."id" IS NOT NULL AND v."organizationId" <> c."organizationId") AS vehicle_tenant_conflicts,
       count(*) FILTER (WHERE d."id" IS NOT NULL AND d."organizationId" <> c."organizationId") AS dossier_tenant_conflicts,
       count(*) FILTER (WHERE s."id" IS NOT NULL AND s."organizationId" <> c."organizationId") AS shipment_tenant_conflicts,
       count(*) FILTER (
         WHERE c."vehicleId" IS NOT NULL AND c."dossierId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "DossierVehicle" dv
             WHERE dv."dossierId" = c."dossierId" AND dv."vehicleId" = c."vehicleId"
           )
       ) AS vehicle_not_in_dossier,
       count(*) FILTER (
         WHERE c."vehicleId" IS NOT NULL AND c."shipmentId" IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM "ShipmentVehicle" sv
             WHERE sv."shipmentId" = c."shipmentId" AND sv."vehicleId" = c."vehicleId"
           )
       ) AS vehicle_not_in_shipment
FROM "CustomsFile" c
LEFT JOIN "Vehicle" v ON v."id" = c."vehicleId"
LEFT JOIN "Dossier" d ON d."id" = c."dossierId"
LEFT JOIN "Shipment" s ON s."id" = c."shipmentId";

ROLLBACK;
