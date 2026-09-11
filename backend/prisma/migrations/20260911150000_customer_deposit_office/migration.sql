ALTER TABLE "CustomerDeposit" ADD COLUMN "officeId" TEXT;

CREATE INDEX "CustomerDeposit_officeId_idx" ON "CustomerDeposit"("officeId");

ALTER TABLE "CustomerDeposit" ADD CONSTRAINT "CustomerDeposit_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
