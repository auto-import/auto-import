-- Manual Call Center records use receivedAt as the editable business call
-- timestamp. createdAt remains the immutable technical insertion timestamp.
ALTER TABLE "CallSession"
  ADD COLUMN "recordedById" TEXT,
  ADD COLUMN "dossierId" TEXT,
  ADD COLUMN "subject" TEXT;

ALTER TABLE "CallSession"
  ADD CONSTRAINT "CallSession_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CallSession_dossierId_fkey"
    FOREIGN KEY ("dossierId") REFERENCES "Dossier"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CallSession_dossierId_receivedAt_idx"
  ON "CallSession"("dossierId", "receivedAt");
CREATE INDEX "CallSession_recordedById_receivedAt_idx"
  ON "CallSession"("recordedById", "receivedAt");
