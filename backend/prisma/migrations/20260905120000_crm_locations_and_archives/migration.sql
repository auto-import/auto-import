-- Editable client profile fields inherited from the originating lead.
ALTER TABLE "Client"
  ADD COLUMN "wilaya" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "notes" TEXT;

UPDATE "Client" client
SET
  "wilaya" = COALESCE(client."wilaya", prospect."wilaya"),
  "city" = COALESCE(client."city", prospect."city"),
  "notes" = COALESCE(client."notes", prospect."notes")
FROM "Prospect" prospect
WHERE client."prospectId" = prospect."id";

-- Cancellation is the canonical dossier archive event.
ALTER TABLE "Dossier"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "archiveReason" TEXT;

UPDATE "Dossier"
SET
  "archivedAt" = COALESCE("closedAt", "updatedAt"),
  "archiveReason" = 'Dossier annulé (migration)'
WHERE "status" = 'cancelled';

ALTER TABLE "Dossier"
  ADD CONSTRAINT "Dossier_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Dossier_organizationId_archivedAt_createdAt_idx"
  ON "Dossier"("organizationId", "archivedAt", "createdAt");
CREATE INDEX "Dossier_organizationId_createdAt_idx"
  ON "Dossier"("organizationId", "createdAt");
CREATE INDEX "Dossier_archivedById_idx" ON "Dossier"("archivedById");

INSERT INTO "Permission" ("id", "resource", "action", "description") VALUES
  (gen_random_uuid(), 'prospects', 'archiveManage', 'Restore or permanently delete archived leads'),
  (gen_random_uuid(), 'dossiers', 'archiveManage', 'Restore or permanently delete archived dossiers')
ON CONFLICT ("resource", "action") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE lower(role."name") IN ('admin', 'administrateur', 'super admin')
  AND permission."resource" IN ('prospects', 'dossiers')
  AND permission."action" = 'archiveManage'
ON CONFLICT DO NOTHING;
