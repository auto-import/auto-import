-- Additive only: saved quotation and cost snapshots are deliberately untouched.
-- A Finance rate may be disabled for future calculations without changing any
-- historical operation that already captured it.
ALTER TABLE "ExchangeRate"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- NOT VALID preserves any legacy invalid rows while preventing new invalid
-- values at the database boundary. The services also reject them explicitly.
ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_positive_rate_check"
  CHECK ("rate" > 0) NOT VALID;

CREATE INDEX "ExchangeRate_organizationId_quoteCurrency_isActive_effectiveAt_idx"
  ON "ExchangeRate"("organizationId", "quoteCurrency", "isActive", "effectiveAt");
