import { apiRequest } from "@/lib/api";
import type { PaginatedData } from "@/lib/api-contract";

export interface ApiInvoiceItem {
  id: string;
  invoiceId: string;
  orderItemId?: string | null;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  tax: string | number;
  total: string | number;
  sourceEntity?: string | null;
}

export interface ApiPaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId?: string | null;
  installmentId?: string | null;
  amount: string | number;
  status: string;
  allocatedAt?: string;
  reversedAt?: string | null;
}

export interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  orderId?: string | null;
  dossierId?: string | null;
  clientId: string;
  status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOIDED";
  subtotal: string | number;
  tax: string | number;
  discount: string | number;
  total: string | number;
  paidAmount: string | number;
  currency: string;
  issueDate?: string | null;
  dueDate?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
  };
  dossier?: {
    id: string;
    reference: string;
    type?: string;
    status?: string;
  } | null;
  order?: { id: string; orderNumber: string; status?: string } | null;
  items?: ApiInvoiceItem[];
  allocations?: ApiPaymentAllocation[];
}

export interface ApiPaymentInstallment {
  id: string;
  paymentPlanId: string;
  installmentNumber: number;
  label?: string | null;
  percentage: string | number;
  amount: string | number;
  paidAmount: string | number;
  dueTrigger: string;
  dueDate?: string | null;
  status:
    "PENDING" | "DUE" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
  allocations?: ApiPaymentAllocation[];
}

export interface ApiPaymentPlan {
  id: string;
  clientId: string;
  dossierId?: string | null;
  orderId?: string | null;
  strategy: "THIRTY_SEVENTY" | "FULL_UPFRONT" | string;
  totalAmount: string | number;
  currency: string;
  status: "active" | "completed" | "cancelled";
  createdAt: string;
  installments?: ApiPaymentInstallment[];
  client?: { id: string; firstName: string; lastName: string };
  dossier?: { id: string; reference: string; status: string } | null;
}

export interface ApiPayment {
  id: string;
  clientId: string;
  dossierId?: string | null;
  orderId?: string | null;
  invoiceId?: string | null;
  installmentId?: string | null;
  contractId?: string | null;
  amount: string | number;
  allocatedAmount: string | number;
  unallocatedAmount: string | number;
  currency: string;
  paymentMethod?: string | null;
  reference?: string | null;
  idempotencyKey?: string | null;
  status: "PENDING" | "CONFIRMED" | "REVERSED" | "FAILED";
  paymentDate?: string | null;
  receivedAt?: string | null;
  confirmedAt?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  notes?: string | null;
  createdAt: string;
  client?: { id: string; firstName: string; lastName: string };
  dossier?: { id: string; reference: string; status: string } | null;
  allocations?: ApiPaymentAllocation[];
  actorUser?: { id: string; firstName: string; lastName: string } | null;
}

export interface ApiCustomerDeposit {
  id: string;
  clientId?: string | null;
  prospectId?: string | null;
  dossierId?: string | null;
  orderId?: string | null;
  amount: string | number;
  appliedAmount: string | number;
  unappliedAmount: string | number;
  currency: string;
  paymentMethod?: string | null;
  reference?: string | null;
  status: "CONFIRMED" | "PARTIALLY_APPLIED" | "FULLY_APPLIED" | "REVERSED";
  paymentDate?: string | null;
  notes?: string | null;
  createdAt: string;
  client?: { id: string; firstName: string; lastName: string } | null;
  dossier?: { id: string; reference: string; status: string } | null;
}

export interface ApiSupplierPayment {
  id: string;
  supplierId: string;
  purchaseId: string;
  amount: string | number;
  paymentKind: "DEPOSIT" | "COMPLEMENT" | "BALANCE";
  currency: string;
  paymentMethod?: string | null;
  reference?: string | null;
  status: "PENDING" | "CONFIRMED" | "REVERSED";
  paymentDate?: string | null;
  paidAt?: string | null;
  confirmedAt?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  notes?: string | null;
  createdAt: string;
  supplier?: { id: string; name: string; country?: string | null };
  purchase?: {
    id: string;
    purchaseNumber: string;
    status: string;
    purchasePrice?: string | number;
    currency?: string;
  };
  purchasePaid?: string | number;
  purchaseRemaining?: string | number;
}

export interface ApiPurchaseForPayment {
  settlement?: {
    total: string;
    paid: string;
    remaining: string;
    currency: string;
    dueDate?: string | null;
    status: string;
    accounts: Array<{ id: string; code: string; name: string }>;
  };
  id: string;
  purchaseNumber: string;
  supplierId: string;
  purchasePrice: string | number;
  currency: string;
  status: string;
  supplier: { id: string; name: string };
  dossier?: { id: string; reference: string } | null;
}

export interface ApiCost {
  id: string;
  type: string;
  costScope?: "DIRECT" | "OPERATING";
  amount: string | number;
  currency: string;
  exchangeRateSnapshot: string | number;
  amountInBaseCurrency?: string | number | null;
  dossierId?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  shipmentId?: string | null;
  customsFileId?: string | null;
  occurredAt: string;
  description?: string | null;
  status: "POSTED" | "REVERSED";
  dossier?: { id: string; reference: string } | null;
  purchase?: { id: string; purchaseNumber: string } | null;
  shipment?: { id: string; shipmentNumber: string } | null;
  customsFile?: { id: string; reference: string } | null;
}

export interface ApiExchangeRate {
  rateType?: string;
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string | number;
  isActive: boolean;
  effectiveAt: string;
  source?: string | null;
  notes?: string | null;
}

export interface DossierFinancialSummary {
  dossierId: string;
  reference: string;
  currency: string;
  baseCurrency: string;
  revenue: {
    total: string;
    totalInBaseCurrency: string;
    collected: string;
    outstanding: string;
    percentage: string;
    state: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID_DEPOSIT";
    overpayment: string;
  };
  gates: {
    strategy: string;
    upfrontRequired: string;
    upfrontCollected: string;
    upfrontPaid: boolean;
    finalRequired: string;
    finalCollected: string;
    finalPaid: boolean;
    canAdvanceToPurchase: boolean;
    canAdvanceToDelivery: boolean;
  };
  costs: {
    totalInBaseCurrency: string;
    purchaseCost: string;
    shippingCost: string;
    customsCost: string;
    otherCost: string;
  };
  supplier: {
    committed: string;
    paid: string;
    outstanding: string;
  };
  profitability: {
    estimatedMarginDzd?: string | null;
    actualMarginDzd?: string;
    actualCostsRecorded?: boolean;
    finalized?: boolean;
    grossMargin: string;
    grossMarginPercentage: string;
  };
  invoices: ApiInvoice[];
  paymentPlan?: ApiPaymentPlan | null;
  payments: ApiPayment[];
  recentCosts: ApiCost[];
}

export interface OrganizationFinancialOverview {
  estimatedMargin?: string;
  recognizedRevenue?: string;
  directCosts?: string;
  operatingCosts?: string;
  dataQuality?: { complete: boolean; warnings: string[] };
  baseCurrency: string;
  totalInvoiced: string;
  totalCollected: string;
  totalOutstanding: string;
  totalCosts: string;
  grossProfit: string;
  invoiceCount: number;
  paymentCount: number;
  costCount: number;
}

export interface ApiContract {
  id: string;
  contractNumber: string;
  clientId: string;
  dossierId: string;
  invoiceId?: string | null;
  totalAmount: string | number;
  requiredDeposit: string | number;
  totalPaid: string;
  remainingBalance: string;
  currency: string;
  status: string;
  collectionStatus: string;
  signedAt?: string | null;
  client: { id: string; firstName: string; lastName: string };
  dossier: { id: string; reference: string };
}

export interface ApiFinanceTransaction {
  office?: { id: string; name: string } | null;
  treasuryAccount?: { id: string; name: string; code: string } | null;
  dossier?: { id: string; reference: string } | null;
  client?: { firstName: string; lastName: string } | null;
  supplier?: { name: string } | null;
  reference?: string | null;
  reversalOfId?: string | null;
  reversalReason?: string | null;
  purchase?: {
    vehicle?: { brand: string; model: string; vin?: string | null };
  } | null;
  rateType?: string;

  id: string;
  type: string;
  direction: "CREDIT" | "DEBIT";
  originalAmount: string | number;
  currency: string;
  exchangeRateSnapshot: string | number;
  amountDzd: string | number;
  status: string;
  occurredAt: string;
  sourceModule: string;
  sourceRecordId: string;
}

export interface ApiTreasuryAccount {
  officeId?: string | null;
  office?: { id: string; name: string } | null;
  openingBalance?: string;
  inflows?: string;
  outflows?: string;
  id: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  status: string;
}

export const fetchContracts = () => apiRequest<ApiContract[]>("/contracts");
export const createContract = (data: {
  clientId: string;
  dossierId: string;
  totalAmount: number;
  currency: string;
  requiredDeposit?: number;
  schedule: Array<{ label?: string; amount: number; dueDate?: string }>;
}) =>
  apiRequest<ApiContract>("/contracts", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const fetchFinanceTransactions = (status?: string) =>
  apiRequest<ApiFinanceTransaction[]>(
    `/finance/transactions${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  );
export const fetchTreasuryAccounts = () =>
  apiRequest<ApiTreasuryAccount[]>("/finance/treasury/accounts");

// Invoices API
export async function fetchInvoices(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
  dossierId?: string;
  orderId?: string;
  currency?: string;
}): Promise<PaginatedData<ApiInvoice>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "tous")
    query.set("status", params.status);
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.dossierId) query.set("dossierId", params.dossierId);
  if (params.orderId) query.set("orderId", params.orderId);
  if (params.currency) query.set("currency", params.currency);

  return apiRequest<PaginatedData<ApiInvoice>>(
    `/finance/invoices?${query.toString()}`,
  );
}

export async function fetchInvoice(id: string): Promise<ApiInvoice> {
  return apiRequest<ApiInvoice>(`/finance/invoices/${id}`);
}

export async function createInvoice(data: {
  clientId: string;
  dossierId?: string;
  contractId?: string;
  orderId?: string;
  currency?: string;
  dueDate?: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    tax?: number;
    orderItemId?: string;
    sourceEntity?: string;
  }>;
}): Promise<ApiInvoice> {
  return apiRequest<ApiInvoice>("/finance/invoices", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function issueInvoice(id: string): Promise<ApiInvoice> {
  return apiRequest<ApiInvoice>(`/finance/invoices/${id}/issue`, {
    method: "POST",
  });
}

export async function voidInvoice(
  id: string,
  reason: string,
): Promise<ApiInvoice> {
  return apiRequest<ApiInvoice>(`/finance/invoices/${id}/void`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Payment Plans API
export async function fetchPaymentPlans(params: {
  page?: number;
  limit?: number;
  clientId?: string;
  dossierId?: string;
  orderId?: string;
  status?: string;
}): Promise<PaginatedData<ApiPaymentPlan>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.dossierId) query.set("dossierId", params.dossierId);
  if (params.orderId) query.set("orderId", params.orderId);
  if (params.status) query.set("status", params.status);

  return apiRequest<PaginatedData<ApiPaymentPlan>>(
    `/finance/payment-plans?${query.toString()}`,
  );
}

export async function createPaymentPlan(data: {
  clientId: string;
  dossierId?: string;
  orderId?: string;
  totalAmount: number;
  currency: string;
  strategy?: string;
}): Promise<ApiPaymentPlan> {
  return apiRequest<ApiPaymentPlan>("/finance/payment-plans", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Payments API
export async function fetchPayments(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
  dossierId?: string;
  orderId?: string;
}): Promise<PaginatedData<ApiPayment>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.dossierId) query.set("dossierId", params.dossierId);
  if (params.orderId) query.set("orderId", params.orderId);

  return apiRequest<PaginatedData<ApiPayment>>(
    `/finance/payments?${query.toString()}`,
  );
}

export async function recordPayment(data: {
  clientId: string;
  dossierId?: string;
  orderId?: string;
  invoiceId?: string;
  contractId?: string;
  installmentId?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  reference?: string;
  idempotencyKey?: string;
  paymentDate?: string;
  notes?: string;
}): Promise<ApiPayment> {
  return apiRequest<ApiPayment>("/finance/payments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmPayment(
  id: string,
  links: { treasuryAccountId?: string; rateType?: string } = {},
): Promise<ApiPayment> {
  return apiRequest<ApiPayment>(`/finance/payments/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify(links),
  });
}

export async function reversePayment(
  id: string,
  reason: string,
): Promise<ApiPayment> {
  return apiRequest<ApiPayment>(`/finance/payments/${id}/reverse`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Customer Deposits API
export async function fetchCustomerDeposits(params: {
  page?: number;
  limit?: number;
  clientId?: string;
  dossierId?: string;
}): Promise<PaginatedData<ApiCustomerDeposit>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.clientId) query.set("clientId", params.clientId);
  if (params.dossierId) query.set("dossierId", params.dossierId);

  return apiRequest<PaginatedData<ApiCustomerDeposit>>(
    `/finance/customer-deposits?${query.toString()}`,
  );
}

export async function applyCustomerDeposit(
  id: string,
  data: { amount: number; invoiceId?: string; installmentId?: string },
): Promise<ApiCustomerDeposit> {
  return apiRequest<ApiCustomerDeposit>(
    `/finance/customer-deposits/${id}/apply`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

// Supplier Payments API
export async function fetchSupplierPayments(params: {
  page?: number;
  limit?: number;
  supplierId?: string;
  purchaseId?: string;
  status?: string;
}): Promise<PaginatedData<ApiSupplierPayment>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.supplierId) query.set("supplierId", params.supplierId);
  if (params.purchaseId) query.set("purchaseId", params.purchaseId);
  if (params.status) query.set("status", params.status);

  return apiRequest<PaginatedData<ApiSupplierPayment>>(
    `/finance/supplier-payments?${query.toString()}`,
  );
}

export async function createSupplierPayment(data: {
  supplierId: string;
  purchaseId: string;
  paymentKind: "DEPOSIT" | "COMPLEMENT" | "BALANCE";
  amount: number;
  currency: string;
  paymentMethod?: string;
  reference?: string;
  idempotencyKey?: string;
  paymentDate?: string;
  notes?: string;
}): Promise<ApiSupplierPayment> {
  return apiRequest<ApiSupplierPayment>("/finance/supplier-payments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function confirmSupplierPayment(
  id: string,
  data: {
    treasuryAccountId?: string;
    supportingDocumentId?: string;
    rateType?: string;
  } = {},
): Promise<ApiSupplierPayment> {
  return apiRequest<ApiSupplierPayment>(
    `/finance/supplier-payments/${id}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

export async function fetchPurchasesForPayment(): Promise<
  PaginatedData<ApiPurchaseForPayment>
> {
  return apiRequest<PaginatedData<ApiPurchaseForPayment>>(
    "/purchases?page=1&limit=100",
  );
}

// Costs API
export async function fetchCosts(params: {
  page?: number;
  limit?: number;
  type?: string;
  dossierId?: string;
  orderId?: string;
  purchaseId?: string;
  shipmentId?: string;
  customsFileId?: string;
  status?: string;
}): Promise<PaginatedData<ApiCost>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.type) query.set("type", params.type);
  if (params.dossierId) query.set("dossierId", params.dossierId);
  if (params.orderId) query.set("orderId", params.orderId);
  if (params.purchaseId) query.set("purchaseId", params.purchaseId);
  if (params.shipmentId) query.set("shipmentId", params.shipmentId);
  if (params.customsFileId) query.set("customsFileId", params.customsFileId);
  if (params.status) query.set("status", params.status);

  return apiRequest<PaginatedData<ApiCost>>(
    `/finance/costs?${query.toString()}`,
  );
}

export async function createCost(data: {
  exchangeRateId?: string;
  type: string;
  costScope?: "DIRECT" | "OPERATING";
  amount: number;
  currency: string;
  dossierId?: string;
  orderId?: string;
  purchaseId?: string;
  shipmentId?: string;
  customsFileId?: string;
  description?: string;
  treasuryAccountId?: string;
  supportingDocumentId?: string;
  occurredAt?: string;
}): Promise<ApiCost> {
  return apiRequest<ApiCost>("/finance/costs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchCurrentDzdRates(): Promise<{
  referenceCurrency: "DZD";
  rates: Array<{
    currency: string;
    exchangeRateId: string | null;
    exchangeRateUsed: string;
  }>;
}> {
  return apiRequest("/finance/costs/dzd-rates");
}

// Exchange Rates API
export async function fetchExchangeRates(params: {
  page?: number;
  limit?: number;
  baseCurrency?: string;
  quoteCurrency?: string;
}): Promise<PaginatedData<ApiExchangeRate>> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.baseCurrency) query.set("baseCurrency", params.baseCurrency);
  if (params.quoteCurrency) query.set("quoteCurrency", params.quoteCurrency);

  return apiRequest<PaginatedData<ApiExchangeRate>>(
    `/finance/exchange-rates?${query.toString()}`,
  );
}

export async function createExchangeRate(data: {
  rateType?: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  isActive?: boolean;
  effectiveAt?: string;
  source?: string;
}): Promise<ApiExchangeRate> {
  return apiRequest<ApiExchangeRate>("/finance/exchange-rates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function setExchangeRateActive(
  id: string,
  isActive: boolean,
): Promise<ApiExchangeRate> {
  return apiRequest<ApiExchangeRate>(`/finance/exchange-rates/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

// Summaries API
export async function fetchDossierFinancialSummary(
  dossierId: string,
): Promise<DossierFinancialSummary> {
  return apiRequest<DossierFinancialSummary>(
    `/finance/dossiers/${dossierId}/summary`,
  );
}

export async function fetchOrganizationFinancialOverview(): Promise<OrganizationFinancialOverview> {
  return apiRequest<OrganizationFinancialOverview>("/finance/summary");
}

export const fetchPaymentAccounts = () =>
  apiRequest<ApiTreasuryAccount[]>("/finance/treasury/payment-accounts");
export const createTreasuryAccount = (data: {
  code: string;
  name: string;
  officeId: string;
  currency: string;
  type: string;
  openingBalance: number;
}) =>
  apiRequest<ApiTreasuryAccount>("/finance/treasury/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const updateTreasuryAccount = (
  id: string,
  data: { officeId?: string; name?: string; status?: string },
) =>
  apiRequest<ApiTreasuryAccount>(`/finance/treasury/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
export const transferTreasury = (data: {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: number;
  destinationAmount?: number;
  reference: string;
  idempotencyKey: string;
}) =>
  apiRequest("/finance/treasury/transfers", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const reverseFinanceTransaction = (id: string, reason: string) =>
  apiRequest(`/finance/transactions/${id}/reverse`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export function financeEntryLabel(code: string): string {
  const labels: Record<string, string> = {
    CUSTOMER_COLLECTION: "Encaissement client",
    SUPPLIER_PAYMENT: "Paiement fournisseur",
    PURCHASE_COMMITMENT: "Engagement achat",
    DIRECT_COST_PURCHASE: "Achat véhicule",
    DIRECT_COST_SUPPLIER: "Achat véhicule",
    DIRECT_COST_SHIPPING: "Fret maritime",
    DIRECT_COST_FREIGHT: "Fret maritime",
    DIRECT_COST_INSURANCE: "Assurance",
    DIRECT_COST_CUSTOMS: "Douane",
    DIRECT_COST_DUTY: "Douane",
    DIRECT_COST_TAX: "Taxes",
    DIRECT_COST_TRANSIT: "Transit",
    DIRECT_COST_PORT: "Port",
    DIRECT_COST_LOCAL_TRANSPORT: "Transport local",
    DIRECT_COST_INSPECTION: "Inspection",
    OPERATING_EXPENSE: "Charge générale",
    TREASURY_TRANSFER: "Transfert de trésorerie",
    COST: "Coût enregistré",
    CUSTOMER_PAYMENT: "Paiement client",
    CUSTOMS_ACTUAL: "Douane",
  };
  if (code.endsWith("_REVERSAL"))
    return `Extourne — ${financeEntryLabel(code.slice(0, -9))}`;
  return (
    labels[code] ??
    (code.startsWith("DIRECT_COST_")
      ? "Autres coûts directs"
      : code.replaceAll("_", " "))
  );
}
