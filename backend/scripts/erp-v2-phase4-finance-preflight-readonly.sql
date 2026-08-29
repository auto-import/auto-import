BEGIN TRANSACTION READ ONLY;

SELECT 'confirmed_payments_without_exchange_rate' AS metric, count(*)::bigint AS value
FROM "Payment" WHERE status = 'CONFIRMED' AND currency <> 'DZD' AND "exchangeRateId" IS NULL
UNION ALL
SELECT 'confirmed_supplier_payments_without_exchange_rate', count(*)::bigint
FROM "SupplierPayment" WHERE status = 'CONFIRMED' AND currency <> 'DZD' AND "exchangeRateId" IS NULL
UNION ALL
SELECT 'posted_costs_without_dzd_value', count(*)::bigint
FROM "Cost" WHERE status = 'POSTED' AND "amountInBaseCurrency" IS NULL
UNION ALL
SELECT 'invoice_payment_currency_mismatch', count(*)::bigint
FROM "Payment" payment JOIN "Invoice" invoice ON invoice.id = payment."invoiceId"
WHERE payment.currency <> invoice.currency
UNION ALL
SELECT 'cross_tenant_payment_dossier', count(*)::bigint
FROM "Payment" payment JOIN "Dossier" dossier ON dossier.id = payment."dossierId"
WHERE payment."organizationId" <> dossier."organizationId";

ROLLBACK;
