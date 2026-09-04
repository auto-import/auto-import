-- Reconcile deployments where the historical nullable-price migration was
-- recorded but the physical ChinaOffer constraints were not changed. These
-- legacy CIF/DDP columns are no longer authoritative supplier inputs.
ALTER TABLE "ChinaOffer" ALTER COLUMN "cifPrice" DROP NOT NULL;
ALTER TABLE "ChinaOffer" ALTER COLUMN "ddpPrice" DROP NOT NULL;
