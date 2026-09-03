-- Add nullable China-side responsable to Dossier (third team role).
ALTER TABLE "Dossier" ADD COLUMN IF NOT EXISTS "chinaResponsibleId" TEXT;
CREATE INDEX IF NOT EXISTS "Dossier_chinaResponsibleId_idx" ON "Dossier"("chinaResponsibleId");
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_chinaResponsibleId_fkey" FOREIGN KEY ("chinaResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
