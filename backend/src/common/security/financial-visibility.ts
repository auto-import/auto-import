import { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../../auth/auth.types';

/** Defense in depth for financial fields embedded in operational API responses. */
export function financialVisibility(
  value: unknown,
  user?: AuthenticatedUser,
): unknown {
  if (!user || user.permissions.includes(Permission.FINANCE_READ)) return value;
  const canPurchase =
    user.permissions.includes(Permission.OFFERS_READ_PURCHASE_PRICE) ||
    user.permissions.includes(Permission.PURCHASES_READ);
  const canMargin = user.permissions.includes(Permission.OFFERS_READ_MARGIN);
  const canCustomer =
    user.permissions.includes(Permission.PAYMENTS_READ) ||
    user.permissions.includes(Permission.CONTRACTS_READ);
  const blocked = (key: string) =>
    (!canMargin &&
      /margin|profit|estimatedCosts|estimated.*Cost|actualOperations|actualMargin|actualCosts|totalCost/i.test(
        key,
      )) ||
    (!canPurchase &&
      /^(vehicleAmount|freightAmount|insuranceAmount|customsAmount|transitAmount|otherCostsAmount|containerPrice|freightShare|totalFreightCost|freightAmountDzd|purchasePrice|supplierPrice|sourceOfferPrice|fobFcaPrice|shippingPrice|localCost|totalOfferPrice|purchases|supplierPayments|costItems|costs|recentCosts|supplierSnapshot|vehicleSnapshot|snapshot|financeTransactions|financeTransaction)$/.test(
        key,
      )) ||
    (!canCustomer &&
      /^(payments|customerPayments|customerDeposits|deposits|contracts|paymentPlan|paymentPlans|invoices|revenue|totalPaid|remainingBalance|totalCollected|outstandingBalance|collectionStatus|totalPayments|totalInvoiceAmount|totalInvoicePaid|isFullyPaid|requiredDeposit|schedule)$/.test(
        key,
      ));
  const redact = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(redact);
    if (input && typeof input === 'object')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([key]) => !blocked(key))
          .map(([key, child]) => [key, redact(child)]),
      );
    return input;
  };
  return redact(value);
}
