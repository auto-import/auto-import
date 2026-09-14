-- Read only. Run against a backup/staging database before production rollout.
-- Every result is a reconciliation task; do not assign an account or invent a historical rate automatically.
SELECT 'accounts_without_office' AS check_name, count(*) FROM "TreasuryAccount" WHERE "archivedAt" IS NULL AND "officeId" IS NULL;
SELECT 'confirmed_customer_payments_without_ledger' AS check_name, count(*) FROM "Payment" p LEFT JOIN "FinanceTransaction" f ON f."customerPaymentId"=p.id WHERE p.status='CONFIRMED' AND f.id IS NULL;
SELECT 'confirmed_supplier_payments_without_ledger' AS check_name, count(*) FROM "SupplierPayment" p LEFT JOIN "FinanceTransaction" f ON f."supplierPaymentId"=p.id WHERE p.status='CONFIRMED' AND f.id IS NULL;
SELECT 'standalone_deposits' AS check_name, count(*) FROM "CustomerDeposit" WHERE "paymentId" IS NULL AND status IN ('CONFIRMED','PARTIALLY_APPLIED','FULLY_APPLIED');
SELECT 'foreign_contracts_without_snapshot' AS check_name, count(*) FROM "Contract" WHERE currency <> 'DZD' AND "amountDzd" IS NULL;
SELECT 'foreign_plans_without_snapshot' AS check_name, count(*) FROM "PaymentPlan" WHERE currency <> 'DZD' AND "amountDzd" IS NULL;
SELECT 'foreign_invoices_without_snapshot' AS check_name, count(*) FROM "Invoice" WHERE currency <> 'DZD' AND "amountDzd" IS NULL;
SELECT 'money_entries_without_account' AS check_name, count(*) FROM "FinanceTransaction" WHERE status='VALIDATED' AND "sourceModule" IN ('CUSTOMER_PAYMENT','SUPPLIER_PAYMENT') AND "treasuryAccountId" IS NULL;
SELECT "organizationId", "purchaseId", count(*) AS posted_purchase_costs FROM "Cost" WHERE status='POSTED' AND type IN ('PURCHASE','SUPPLIER') AND "purchaseId" IS NOT NULL GROUP BY "organizationId","purchaseId" HAVING count(*)>1;
SELECT "organizationId", "customsFileId", count(*) AS posted_customs_costs FROM "Cost" WHERE status='POSTED' AND type='CUSTOMS' AND "customsFileId" IS NOT NULL GROUP BY "organizationId","customsFileId" HAVING count(*)>1;
SELECT 'invalid_catalogue_source' AS check_name, count(*) FROM "CatalogueItem" WHERE ("sourceVehicleId" IS NULL)=("sourceOfferVehicleId" IS NULL);
