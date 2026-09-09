-- Additive only: preserve legacy port text and physical container presets.
CREATE TYPE "ShipmentContainerType" AS ENUM ('THREE_VEHICLES', 'FOUR_VEHICLES');
ALTER TABLE "Shipment" ADD COLUMN "containerType" "ShipmentContainerType",
  ADD COLUMN "departurePortId" TEXT, ADD COLUMN "arrivalPortId" TEXT;
UPDATE "Shipment" s SET "containerType" = CASE p."maxVehicles"
  WHEN 3 THEN 'THREE_VEHICLES'::"ShipmentContainerType"
  WHEN 4 THEN 'FOUR_VEHICLES'::"ShipmentContainerType" END
FROM "ContainerPreset" p WHERE s."containerPresetId" = p.id;

CREATE TABLE "Port" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL, "code" TEXT NOT NULL, "country" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Port_code_nonempty" CHECK ("code" = upper(trim("code")) AND length("code") > 0),
  CONSTRAINT "Port_name_nonempty" CHECK (length(trim("name")) > 0)
);
CREATE UNIQUE INDEX "Port_organizationId_code_key" ON "Port"("organizationId", "code");
CREATE UNIQUE INDEX "Port_id_organizationId_key" ON "Port"("id", "organizationId");
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_departurePortId_organizationId_fkey"
  FOREIGN KEY ("departurePortId", "organizationId") REFERENCES "Port"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_arrivalPortId_organizationId_fkey"
  FOREIGN KEY ("arrivalPortId", "organizationId") REFERENCES "Port"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Import only legacy ports with an explicit code; never invent missing codes.
WITH legacy AS (
  SELECT "organizationId", "departurePort" AS label FROM "Shipment"
  UNION SELECT "organizationId", "arrivalPort" FROM "Shipment"
), parsed AS (
  SELECT "organizationId", trim(regexp_replace(label, '\s*\([A-Za-z0-9-]+\)\s*$', '')) AS name,
    upper(substring(label FROM '\(([A-Za-z0-9-]+)\)\s*$')) AS code
  FROM legacy WHERE label ~ '\([A-Za-z0-9-]+\)\s*$'
)
INSERT INTO "Port" (id, "organizationId", name, code, "updatedAt")
SELECT gen_random_uuid()::text, "organizationId", min(name), code, CURRENT_TIMESTAMP
FROM parsed WHERE name <> '' GROUP BY "organizationId", code ON CONFLICT DO NOTHING;
UPDATE "Shipment" s SET "departurePortId" = p.id FROM "Port" p
WHERE p."organizationId" = s."organizationId" AND p.code = upper(substring(s."departurePort" FROM '\(([A-Za-z0-9-]+)\)\s*$'));
UPDATE "Shipment" s SET "arrivalPortId" = p.id FROM "Port" p
WHERE p."organizationId" = s."organizationId" AND p.code = upper(substring(s."arrivalPort" FROM '\(([A-Za-z0-9-]+)\)\s*$'));
