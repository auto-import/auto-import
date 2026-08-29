-- Read-only post-migration count and safety assertions for Phase 1.
BEGIN TRANSACTION READ ONLY;

SELECT
  (SELECT count(*) FROM "Prospect") AS prospects,
  (SELECT count(*) FROM "Client") AS clients,
  (SELECT count(*) FROM "ProspectConversion") AS conversions,
  (SELECT count(*) FROM "CrmReferenceValue") AS reference_values,
  (SELECT count(*) FROM "Prospect" WHERE source IS DISTINCT FROM "legacySource") AS source_loss,
  (SELECT count(*) FROM pg_indexes
   WHERE tablename IN ('Prospect', 'Client')
     AND indexdef ILIKE '%phoneNormalized%'
     AND indexdef ILIKE '%UNIQUE%') AS phone_projection_unique_indexes;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = '"ContactPoint"'::regclass
  AND conname = 'ContactPoint_at_least_one_owner_check';

ROLLBACK;
