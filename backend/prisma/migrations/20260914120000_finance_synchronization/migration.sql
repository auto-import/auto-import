-- Additive: old unknown offices/rates stay NULL, no fabricated history.
ALTER TABLE "TreasuryAccount" ADD COLUMN "officeId" TEXT REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransaction" ADD COLUMN "officeId" TEXT REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE, ADD COLUMN "transferGroupId" TEXT, ADD COLUMN "rateType" TEXT NOT NULL DEFAULT 'COMMERCIAL';
CREATE INDEX "FinanceTransaction_transferGroupId_idx" ON "FinanceTransaction"("transferGroupId");
CREATE INDEX "FinanceTransaction_officeId_occurredAt_idx" ON "FinanceTransaction"("officeId", "occurredAt");
ALTER TABLE "ExchangeRate" ADD COLUMN "rateType" TEXT NOT NULL DEFAULT 'COMMERCIAL';
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rateType_check" CHECK ("rateType" IN ('COMMERCIAL','BANK','INTERNAL','MANUAL'));
-- Preserve all rate records; resolve duplicate active definitions at exactly the same date deterministically.
WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY "organizationId", "baseCurrency", "quoteCurrency", "rateType", "effectiveAt" ORDER BY "createdAt" DESC, id DESC) rank FROM "ExchangeRate" WHERE "isActive")
UPDATE "ExchangeRate" r SET "isActive" = false FROM ranked d WHERE r.id=d.id AND d.rank>1;
CREATE UNIQUE INDEX "ExchangeRate_active_definition_key" ON "ExchangeRate"("organizationId", "baseCurrency", "quoteCurrency", "rateType", "effectiveAt") WHERE "isActive";
ALTER TABLE "Contract" ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,8), ADD COLUMN "amountDzd" DECIMAL(14,2);
ALTER TABLE "Invoice" ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,8), ADD COLUMN "amountDzd" DECIMAL(14,2);
ALTER TABLE "PaymentPlan" ADD COLUMN "exchangeRateSnapshot" DECIMAL(18,8), ADD COLUMN "amountDzd" DECIMAL(14,2);
UPDATE "Contract" SET "exchangeRateSnapshot"=1, "amountDzd"="totalAmount" WHERE "currency"='DZD';
UPDATE "Invoice" SET "exchangeRateSnapshot"=1, "amountDzd"="total" WHERE "currency"='DZD';
UPDATE "PaymentPlan" SET "exchangeRateSnapshot"=1, "amountDzd"="totalAmount" WHERE "currency"='DZD';
-- Every validated/reversed financial fact is permanent. Only the VALIDATED -> REVERSED status change is allowed.
CREATE FUNCTION corapide_protect_finance_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('VALIDATED','REVERSED') THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Validated financial history cannot be deleted' USING ERRCODE='23514'; END IF;
   IF NOT (OLD.status='VALIDATED' AND NEW.status='REVERSED' AND (to_jsonb(OLD)-'status')=(to_jsonb(NEW)-'status')) THEN
     RAISE EXCEPTION 'Validated financial history requires a reversal' USING ERRCODE='23514';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FinanceTransaction_immutable" BEFORE UPDATE OR DELETE ON "FinanceTransaction" FOR EACH ROW EXECUTE FUNCTION corapide_protect_finance_history();

ALTER TABLE "Purchase" ADD COLUMN "dueDate" TIMESTAMP(3);
