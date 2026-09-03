ALTER TABLE "Dossier" DROP CONSTRAINT IF EXISTS "Dossier_chinaResponsibleId_fkey";
DROP INDEX IF EXISTS "Dossier_chinaResponsibleId_idx";
ALTER TABLE "Dossier" DROP COLUMN IF EXISTS "chinaResponsibleId";
