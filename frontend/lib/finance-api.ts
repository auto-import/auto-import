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
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string | number;
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
    grossMargin: string;
    grossMarginPercentage: string;
  };
  invoices: ApiInvoice[];
  paymentPlan?: ApiPaymentPlan | null;
  payments: ApiPayment[];
  recentCosts: ApiCost[];
}

export interface OrganizationFinancialOverview {
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
  id: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  balance: string;
  status: string;
}

export const fetchContracts = () => apiRequest<ApiContract[]>("/contracts");
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

export async function confirmPayment(id: string): Promise<ApiPayment> {
  return apiRequest<ApiPayment>(`/finance/payments/${id}/confirm`, {
    method: "POST",
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
  data: { treasuryAccountId?: string; supportingDocumentId?: string } = {},
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
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  effectiveAt?: string;
  source?: string;
}): Promise<ApiExchangeRate> {
  return apiRequest<ApiExchangeRate>("/finance/exchange-rates", {
    method: "POST",
    body: JSON.stringify(data),
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
