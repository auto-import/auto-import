BEGIN TRANSACTION READ ONLY;

SELECT 'validated_payment_without_ledger' AS metric, count(*)::bigint AS value
FROM "Payment" payment LEFT JOIN "FinanceTransaction" tx ON tx."customerPaymentId" = payment.id
WHERE payment.status = 'CONFIRMED' AND tx.id IS NULL
UNION ALL
SELECT 'validated_supplier_payment_without_ledger', count(*)::bigint
FROM "SupplierPayment" payment LEFT JOIN "FinanceTransaction" tx ON tx."supplierPaymentId" = payment.id
WHERE payment.status = 'CONFIRMED' AND tx.id IS NULL
UNION ALL
SELECT 'posted_cost_without_ledger', count(*)::bigint
FROM "Cost" cost LEFT JOIN "FinanceTransaction" tx ON tx."costId" = cost.id
WHERE cost.status = 'POSTED' AND tx.id IS NULL
UNION ALL
SELECT 'contract_schedule_total_mismatch', count(*)::bigint
FROM "Contract" contract
LEFT JOIN (SELECT "contractId", sum(amount) total FROM "ContractScheduleItem" GROUP BY "contractId") schedule ON schedule."contractId" = contract.id
WHERE coalesce(schedule.total, 0) <> contract."totalAmount"
UNION ALL
SELECT 'ledger_dzd_snapshot_mismatch', count(*)::bigint
FROM "FinanceTransaction"
WHERE abs("amountDzd" - round("originalAmount" * "exchangeRateSnapshot", 2)) > 0.01
UNION ALL
SELECT 'cross_tenant_contract', count(*)::bigint
FROM "Contract" contract JOIN "Dossier" dossier ON dossier.id = contract."dossierId" JOIN "Client" client ON client.id = contract."clientId"
WHERE contract."organizationId" <> dossier."organizationId" OR contract."organizationId" <> client."organizationId" OR dossier."clientId" <> client.id;

ROLLBACK;
