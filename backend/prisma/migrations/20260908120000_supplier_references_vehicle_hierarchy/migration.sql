-- Additive supplier reference data and strict vehicle lookup relationships.
-- Historical display strings and legacy lookup ids remain untouched.

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "supplierTypeOther" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "versionLookupId" TEXT;

INSERT INTO "CrmReferenceValue" (
  "id", "organizationId", "kind", "code", "labelFr", "sortOrder", "updatedAt"
)
SELECT gen_random_uuid()::text, organization."id", defaults.kind,
       defaults.code, defaults.label, defaults.sort_order, CURRENT_TIMESTAMP
FROM "Organization" organization
CROSS JOIN (VALUES
  ('SUPPLIER_COUNTRY', 'SUPPLIER_COUNTRY_ALGERIE', 'Algérie', 0),
  ('SUPPLIER_COUNTRY', 'SUPPLIER_COUNTRY_CHINE', 'Chine', 1),
  ('SUPPLIER_CURRENCY', 'SUPPLIER_CURRENCY_USD', 'USD', 2),
  ('SUPPLIER_CURRENCY', 'SUPPLIER_CURRENCY_CNY', 'CNY', 3),
  ('SUPPLIER_CURRENCY', 'SUPPLIER_CURRENCY_DZD', 'DZD', 4)
) defaults(kind, code, label, sort_order)
ON CONFLICT ("organizationId", "kind", "code") DO NOTHING;

-- Preserve all supplier values already used in production as managed choices.
INSERT INTO "CrmReferenceValue" (
  "id", "organizationId", "kind", "code", "labelFr", "sortOrder", "updatedAt"
)
SELECT gen_random_uuid()::text, existing."organizationId", 'SUPPLIER_COUNTRY',
       'SUPPLIER_COUNTRY_LEGACY_' || md5(lower(trim(existing.country))),
       existing.country, 100, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON ("organizationId", lower(trim("country")))
    "organizationId", trim("country") AS country, "createdAt"
  FROM "Partner"
  WHERE "type" = 'supplier' AND "country" IS NOT NULL AND trim("country") <> ''
  ORDER BY "organizationId", lower(trim("country")), "createdAt"
) existing
ON CONFLICT ("organizationId", "kind", "code") DO NOTHING;

INSERT INTO "CrmReferenceValue" (
  "id", "organizationId", "kind", "code", "labelFr", "sortOrder", "updatedAt"
)
SELECT gen_random_uuid()::text, existing."organizationId", 'SUPPLIER_CURRENCY',
       'SUPPLIER_CURRENCY_' || upper(existing.currency),
       upper(existing.currency), 100, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "organizationId", trim("preferredCurrency") AS currency
  FROM "Partner"
  WHERE "type" = 'supplier'
    AND "preferredCurrency" IS NOT NULL
    AND trim("preferredCurrency") ~* '^[a-z]{3}$'
) existing
ON CONFLICT ("organizationId", "kind", "code") DO NOTHING;

-- Fill currently empty relational ids from the historical canonical strings.
UPDATE "Vehicle" vehicle
SET "brandLookupId" = brand."id"
FROM "VehicleLookupValue" brand
WHERE brand."organizationId" = vehicle."organizationId"
  AND brand."kind" = 'BRAND'
  AND brand."normalizedValue" = lower(trim(vehicle."brand"))
  AND vehicle."brandLookupId" IS NULL;

UPDATE "Vehicle" vehicle
SET "modelLookupId" = model."id"
FROM "VehicleLookupValue" model
WHERE model."organizationId" = vehicle."organizationId"
  AND model."kind" = 'MODEL'
  AND model."parentId" = vehicle."brandLookupId"
  AND model."normalizedValue" = lower(trim(vehicle."model"))
  AND vehicle."modelLookupId" IS NULL;

INSERT INTO "VehicleLookupValue" (
  "id", "organizationId", "kind", "value", "normalizedValue", "parentId", "needsReview", "updatedAt"
)
SELECT gen_random_uuid()::text, vehicle."organizationId", 'VERSION',
       trim(vehicle."trim"), lower(trim(vehicle."trim")), vehicle."modelLookupId", false, CURRENT_TIMESTAMP
FROM "Vehicle" vehicle
WHERE vehicle."modelLookupId" IS NOT NULL
  AND vehicle."trim" IS NOT NULL
  AND trim(vehicle."trim") <> ''
GROUP BY vehicle."organizationId", trim(vehicle."trim"), vehicle."modelLookupId"
ON CONFLICT DO NOTHING;

UPDATE "Vehicle" vehicle
SET "versionLookupId" = version."id"
FROM "VehicleLookupValue" version
WHERE version."organizationId" = vehicle."organizationId"
  AND version."kind" = 'VERSION'
  AND version."parentId" = vehicle."modelLookupId"
  AND version."normalizedValue" = lower(trim(vehicle."trim"))
  AND vehicle."versionLookupId" IS NULL;

-- NOT VALID keeps potentially inconsistent historical scalar ids readable,
-- while PostgreSQL enforces every new or changed relationship immediately.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vehicle_brandLookupId_fkey') THEN
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_brandLookupId_fkey"
      FOREIGN KEY ("brandLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vehicle_modelLookupId_fkey') THEN
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_modelLookupId_fkey"
      FOREIGN KEY ("modelLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Vehicle_versionLookupId_fkey') THEN
    ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_versionLookupId_fkey"
      FOREIGN KEY ("versionLookupId") REFERENCES "VehicleLookupValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Vehicle_versionLookupId_idx" ON "Vehicle"("versionLookupId");
