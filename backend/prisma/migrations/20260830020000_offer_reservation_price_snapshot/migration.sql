-- Freeze the exact supplier-offer revision selected by each reservation.
-- Historical reservations are linked to the current revision produced by the
-- preceding backfill; no supplier amount is reconstructed or overwritten.
ALTER TABLE "OfferReservation"
  ADD COLUMN "sourceOfferRevisionId" TEXT;

UPDATE "OfferReservation" reservation
SET "sourceOfferRevisionId" = offer."currentRevisionId"
FROM "ChinaOffer" offer
WHERE offer."id" = reservation."offerId"
  AND reservation."sourceOfferRevisionId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "OfferReservation" WHERE "sourceOfferRevisionId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot freeze offer reservations: a source offer revision is missing';
  END IF;
END $$;

ALTER TABLE "OfferReservation"
  ALTER COLUMN "sourceOfferRevisionId" SET NOT NULL,
  ADD CONSTRAINT "OfferReservation_sourceOfferRevisionId_fkey"
    FOREIGN KEY ("sourceOfferRevisionId") REFERENCES "ChinaOfferRevision"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "OfferReservation_sourceOfferRevisionId_idx"
  ON "OfferReservation"("sourceOfferRevisionId");

