-- Add vehicle-level pricing breakdown: raw cost inputs and the computed DDP result.
-- (CIF result reuses the existing "sellingPrice" column; "Prix d'achat" reuses "purchasePrice".)
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "fobFcaPrice" DECIMAL(12,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "shippingPrice" DECIMAL(12,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "profitAmount" DECIMAL(12,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "customsClearanceAmount" DECIMAL(12,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "localTransportAmount" DECIMAL(12,2);
ALTER TABLE "Vehicle" ADD COLUMN IF NOT EXISTS "ddpPrice" DECIMAL(12,2);
