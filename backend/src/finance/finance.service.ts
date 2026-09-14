import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async getDossierFinancialSummary(dossierId: string, organizationId: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: {
        catalogueItem: { select: { sourceVehicleId: true } },
        commercialQuotationRevision: true,
        contracts: {
          where: { archivedAt: null, status: 'SIGNED' },
          orderBy: [{ signedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
        paymentPlans: {
          where: { status: { in: ['active', 'completed'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            installments: {
              orderBy: { installmentNumber: 'asc' },
              include: {
                allocations: {
                  where: { status: 'ACTIVE' },
                },
              },
            },
          },
        },
        invoices: {
          where: {
            status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
          },
          include: {
            items: true,
            allocations: {
              where: { status: 'ACTIVE' },
            },
          },
        },
        payments: {
          where: { status: 'CONFIRMED' },
          include: {
            financeTransaction: true,
            allocations: {
              where: { status: 'ACTIVE' },
            },
          },
        },
        customerDeposits: {
          where: {
            status: { in: ['CONFIRMED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED'] },
          },
        },
        purchases: {
          include: {
            financeTransactions: true,
            payments: {
              where: { status: 'CONFIRMED' },
              include: { financeTransaction: true },
            },
          },
        },
        costs: {
          where: { status: 'POSTED', costScope: 'DIRECT' },
        },
        customsFiles: {
          include: {
            costs: { where: { status: 'POSTED' } },
          },
        },
      },
    });

    if (!dossier) {
      throw new NotFoundException('Dossier not found');
    }

    // A stock acquisition predates its sales dossier. Follow the existing purchase reference, without copying or rewriting its validated ledger entry.
    if (dossier.catalogueItem?.sourceVehicleId) {
      const stockPurchases = await this.prisma.purchase.findMany({
        where: {
          organizationId,
          vehicleId: dossier.catalogueItem.sourceVehicleId,
          dossierId: null,
        },
        include: {
          payments: {
            where: { status: 'CONFIRMED' },
            include: { financeTransaction: true },
          },
          financeTransactions: true,
        },
      });
      dossier.purchases.push(...stockPurchases);
      const stockCosts = await this.prisma.cost.findMany({
        where: {
          organizationId,
          purchaseId: { in: stockPurchases.map((purchase) => purchase.id) },
          dossierId: null,
          status: 'POSTED',
          costScope: 'DIRECT',
        },
      });
      dossier.costs.push(...stockCosts);
    }
    const activePlan = dossier.paymentPlans[0] || null;

    // Revenue calculation
    let totalRevenue = new Prisma.Decimal(0);
    let currency = 'DZD';

    const commercialContract = dossier.contracts?.[0] ?? null;
    if (commercialContract) {
      totalRevenue = commercialContract.totalAmount;
      currency = commercialContract.currency;
    } else if (activePlan) {
      totalRevenue = activePlan.totalAmount;
      currency = activePlan.currency;
    } else if (dossier.invoices.length > 0) {
      totalRevenue = dossier.invoices.reduce(
        (sum, inv) => sum.add(inv.total),
        new Prisma.Decimal(0),
      );
      currency = dossier.invoices[0].currency;
    }

    const warnings: string[] = [];
    const historicalDzd = (
      amount: Prisma.Decimal,
      originalCurrency: string,
      snapshot?: Prisma.Decimal | null,
    ) => {
      if (snapshot != null) return snapshot;
      if (originalCurrency === 'DZD') return amount;
      warnings.push(
        `Contre-valeur historique ${originalCurrency} manquante ; montant exclu des totaux DZD.`,
      );
      return new Prisma.Decimal(0);
    };
    const revenueSnapshot =
      commercialContract?.amountDzd ?? activePlan?.amountDzd;
    let totalRevenueBase = historicalDzd(
      totalRevenue,
      currency,
      revenueSnapshot,
    );
    if (!commercialContract && !activePlan && dossier.invoices.length)
      totalRevenueBase = dossier.invoices.reduce(
        (sum, invoice) =>
          sum.add(
            historicalDzd(invoice.total, invoice.currency, invoice.amountDzd),
          ),
        new Prisma.Decimal(0),
      );
    if (
      !commercialContract &&
      !activePlan &&
      !dossier.invoices.length &&
      dossier.priceCurrency === 'DZD'
    )
      totalRevenueBase =
        dossier.type === 'VEHICLE_SALE_DDP'
          ? (dossier.ddpPrice ?? new Prisma.Decimal(0))
          : (dossier.cifPrice ?? new Prisma.Decimal(0));
    let totalCollected = dossier.payments.reduce(
      (sum, payment) =>
        sum.add(
          historicalDzd(
            payment.amount,
            payment.currency ?? currency,
            payment.financeTransaction?.amountDzd,
          ),
        ),
      new Prisma.Decimal(0),
    );
    for (const deposit of dossier.customerDeposits ?? [])
      if (!deposit.paymentId) {
        totalCollected = totalCollected.add(
          historicalDzd(deposit.amount, deposit.currency),
        );
        warnings.push(
          'Acompte historique sans projection Journal : rapprochement requis.',
        );
      }
    totalRevenue = totalRevenueBase;
    currency = 'DZD';
    const outstandingBalance = totalRevenue.minus(totalCollected);
    const paymentPercentage = totalRevenue.gt(0)
      ? Prisma.Decimal.min(
          totalCollected.mul(100).div(totalRevenue),
          100,
        ).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const paymentState = totalCollected.lte(0)
      ? 'UNPAID'
      : totalCollected.gt(totalRevenue)
        ? 'OVERPAID_DEPOSIT'
        : totalCollected.gte(totalRevenue)
          ? 'PAID'
          : 'PARTIALLY_PAID';

    // Installments & Gates breakdown
    let upfrontRequired = new Prisma.Decimal(0);
    let upfrontCollected = new Prisma.Decimal(0);
    let finalRequired = new Prisma.Decimal(0);
    let finalCollected = new Prisma.Decimal(0);

    if (activePlan && activePlan.installments.length > 0) {
      const firstInst = activePlan.installments[0];
      upfrontRequired = firstInst.amount.mul(
        activePlan.exchangeRateSnapshot ??
          (activePlan.currency === 'DZD' ? 1 : 0),
      );
      upfrontCollected = Prisma.Decimal.min(totalCollected, upfrontRequired);

      if (activePlan.installments.length > 1) {
        const secondInst = activePlan.installments[1];
        finalRequired = secondInst.amount.mul(
          activePlan.exchangeRateSnapshot ??
            (activePlan.currency === 'DZD' ? 1 : 0),
        );
        finalCollected = Prisma.Decimal.max(
          totalCollected.sub(upfrontRequired),
          0,
        );
      }
    } else {
      upfrontRequired = (
        commercialContract?.requiredDeposit ?? new Prisma.Decimal(0)
      ).mul(
        commercialContract?.exchangeRateSnapshot ??
          (commercialContract?.currency === 'DZD' ? 1 : 0),
      );
      upfrontCollected = totalCollected.greaterThanOrEqualTo(upfrontRequired)
        ? upfrontRequired
        : totalCollected;
      finalRequired = totalRevenue.minus(upfrontRequired);
      finalCollected = totalCollected.greaterThan(upfrontRequired)
        ? totalCollected.minus(upfrontRequired)
        : new Prisma.Decimal(0);
    }

    const upfrontPaid =
      upfrontCollected.greaterThanOrEqualTo(upfrontRequired) &&
      upfrontRequired.greaterThan(0);
    const finalPaid =
      outstandingBalance.lessThanOrEqualTo(0) && totalRevenue.greaterThan(0);

    // Costs Breakdown
    let purchaseCost = new Prisma.Decimal(0);
    let shippingCost = new Prisma.Decimal(0);
    let customsCost = new Prisma.Decimal(0);
    let otherCost = new Prisma.Decimal(0);
    let totalCostBase = new Prisma.Decimal(0);

    for (const cost of dossier.costs) {
      if (cost.costScope && cost.costScope !== 'DIRECT') continue;
      const baseAmount = historicalDzd(
        cost.amount,
        cost.currency ?? 'DZD',
        cost.amountInBaseCurrency,
      );
      totalCostBase = totalCostBase.add(baseAmount);

      switch (cost.type) {
        case 'PURCHASE':
        case 'SUPPLIER':
          purchaseCost = purchaseCost.add(baseAmount);
          break;
        case 'SHIPPING':
          shippingCost = shippingCost.add(baseAmount);
          break;
        case 'CUSTOMS':
        case 'DUTY':
        case 'TAX':
          customsCost = customsCost.add(baseAmount);
          break;
        default:
          otherCost = otherCost.add(baseAmount);
          break;
      }
    }

    // A confirmed purchase is recognized by its single POSTED Cost. Payments settle it; they never add another cost.
    let totalSupplierCommitted = new Prisma.Decimal(0);
    let totalSupplierPaid = new Prisma.Decimal(0);
    let totalSupplierRemaining = new Prisma.Decimal(0);
    for (const p of dossier.purchases) {
      if (p.status === 'cancelled') continue;
      const purchaseEntry = p.financeTransactions?.find(
        (entry) =>
          entry.sourceModule === 'PURCHASE_COMMITMENT' &&
          entry.status === 'VALIDATED',
      );
      const purchaseCostSnapshot = dossier.costs.find(
        (cost) => cost.purchaseId === p.id && cost.type === 'PURCHASE',
      );
      const committedBase = historicalDzd(
        p.purchasePrice,
        p.currency,
        purchaseEntry?.amountDzd ?? purchaseCostSnapshot?.amountInBaseCurrency,
      );
      totalSupplierCommitted = totalSupplierCommitted.add(committedBase);
      const paidBase = p.payments.reduce(
        (sum, sp) =>
          sum.add(
            sp.financeTransaction?.amountDzd ??
              (p.currency === 'DZD' ? sp.amount : new Prisma.Decimal(0)),
          ),
        new Prisma.Decimal(0),
      );
      totalSupplierPaid = totalSupplierPaid.add(paidBase);
      const paidOriginal = p.payments.reduce(
        (sum, payment) => sum.add(payment.amount),
        new Prisma.Decimal(0),
      );
      if (p.purchasePrice.gt(0))
        totalSupplierRemaining = totalSupplierRemaining.add(
          Prisma.Decimal.max(p.purchasePrice.sub(paidOriginal), 0)
            .mul(committedBase)
            .div(p.purchasePrice)
            .toDecimalPlaces(2),
        );
    }

    const grossMargin = totalRevenueBase.minus(totalCostBase);
    const grossMarginPercentage = totalRevenueBase.greaterThan(0)
      ? grossMargin.mul(100).dividedBy(totalRevenueBase).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    return {
      dataQuality: {
        complete: warnings.length === 0,
        warnings: [...new Set(warnings)],
      },
      dossierId: dossier.id,
      reference: dossier.reference,
      currency,
      baseCurrency: 'DZD',
      revenue: {
        total: totalRevenue.toString(),
        totalInBaseCurrency: totalRevenueBase.toString(),
        collected: totalCollected.toString(),
        outstanding: outstandingBalance.greaterThan(0)
          ? outstandingBalance.toString()
          : '0.00',
        percentage: paymentPercentage.toString(),
        state: paymentState,
        overpayment: outstandingBalance.lessThan(0)
          ? outstandingBalance.abs().toString()
          : '0.00',
      },
      gates: {
        strategy: commercialContract
          ? 'CONTRACT_SCHEDULE'
          : activePlan?.strategy || 'NO_SCHEDULE',
        upfrontRequired: upfrontRequired.toString(),
        upfrontCollected: upfrontCollected.toString(),
        upfrontPaid,
        finalRequired: finalRequired.toString(),
        finalCollected: finalCollected.toString(),
        finalPaid,
        canAdvanceToPurchase: upfrontPaid,
        canAdvanceToDelivery: finalPaid,
      },
      costs: {
        byType: Object.fromEntries(
          [...new Set(dossier.costs.map((cost) => cost.type))].map((type) => [
            type,
            dossier.costs
              .filter((cost) => cost.type === type)
              .reduce(
                (sum, cost) =>
                  sum.add(
                    historicalDzd(
                      cost.amount,
                      cost.currency,
                      cost.amountInBaseCurrency,
                    ),
                  ),
                new Prisma.Decimal(0),
              )
              .toString(),
          ]),
        ),
        totalInBaseCurrency: totalCostBase.toString(),
        purchaseCost: purchaseCost.toString(),
        shippingCost: shippingCost.toString(),
        customsCost: customsCost.toString(),
        otherCost: otherCost.toString(),
      },
      supplier: {
        currency: 'DZD',
        committed: totalSupplierCommitted.toString(),
        paid: totalSupplierPaid.toString(),
        outstanding: totalSupplierRemaining.toString(),
      },
      profitability: {
        estimatedMarginDzd:
          dossier.commercialQuotationRevision?.estimatedProfitDzd.toString() ??
          null,
        actualMarginDzd: grossMargin.toString(),
        actualCostsRecorded: dossier.costs.length > 0,
        finalized: Boolean(dossier.closedAt),
        grossMargin: grossMargin.toString(),
        grossMarginPercentage: grossMarginPercentage.toString(),
      },
      invoices: dossier.invoices,
      contract: commercialContract,
      paymentPlan: activePlan,
      payments: dossier.payments,
      recentCosts: dossier.costs,
    };
  }

  async getOrganizationFinancialOverview(organizationId: string) {
    const [
      contracts,
      plans,
      invoices,
      payments,
      costs,
      dossiers,
      standaloneDeposits,
    ] = await Promise.all([
      this.prisma.contract.findMany({
        where: { organizationId, archivedAt: null, status: 'SIGNED' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentPlan.findMany({
        where: { organizationId, status: { in: ['active', 'completed'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { in: ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
        },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, status: 'CONFIRMED' },
        include: { financeTransaction: true },
      }),
      this.prisma.cost.findMany({
        where: { organizationId, status: 'POSTED' },
      }),
      this.prisma.dossier.findMany({
        where: { organizationId },
        select: {
          id: true,
          status: true,
          closedAt: true,
          priceCurrency: true,
          cifPrice: true,
          ddpPrice: true,
          type: true,
          commercialQuotationRevision: true,
        },
      }),
      this.prisma.customerDeposit.findMany({
        where: {
          organizationId,
          paymentId: null,
          status: { in: ['CONFIRMED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED'] },
        },
      }),
    ]);
    const warnings: string[] = [];
    const zero = () => new Prisma.Decimal(0);
    const dzd = (
      amount: Prisma.Decimal,
      currency: string,
      snapshot?: Prisma.Decimal | null,
    ) => {
      if (snapshot != null) return snapshot;
      if (currency === 'DZD') return amount;
      warnings.push(`Contre-valeur historique ${currency} manquante.`);
      return zero();
    };
    const obligations = new Map<string, Prisma.Decimal>();
    const key = (row: {
      dossierId?: string | null;
      orderId?: string | null;
      id: string;
    }) => row.dossierId ?? row.orderId ?? row.id;
    let totalContracted = zero();
    for (const row of contracts) {
      if (obligations.has(key(row))) continue;
      const amount = dzd(row.totalAmount, row.currency, row.amountDzd);
      obligations.set(key(row), amount);
      totalContracted = totalContracted.add(amount);
    }
    for (const row of plans)
      if (!obligations.has(key(row)))
        obligations.set(
          key(row),
          dzd(row.totalAmount, row.currency, row.amountDzd),
        );
    const invoiced = new Map<string, Prisma.Decimal>();
    let totalInvoiced = zero();
    for (const row of invoices) {
      const amount = dzd(row.total, row.currency, row.amountDzd);
      totalInvoiced = totalInvoiced.add(amount);
      invoiced.set(key(row), (invoiced.get(key(row)) ?? zero()).add(amount));
    }
    for (const [id, amount] of invoiced)
      if (!obligations.has(id)) obligations.set(id, amount);
    const signedStatuses = [
      'contractSigned',
      'depositReceived',
      'vehicleBooking',
      'inspection',
      'purchaseConfirmed',
      'shipmentBooking',
      'loading',
      'inTransit',
      'arrived',
      'documentsReady',
      'balanceReceived',
      'documentsDelivered',
      'customsClearance',
      'readyForDelivery',
      'deliveredToClient',
      'closed',
      'serviceCompleted',
    ];
    for (const dossier of dossiers)
      if (
        !obligations.has(dossier.id) &&
        dossier.priceCurrency === 'DZD' &&
        signedStatuses.includes(dossier.status)
      )
        obligations.set(
          dossier.id,
          (dossier.type === 'VEHICLE_SALE_DDP'
            ? dossier.ddpPrice
            : dossier.cifPrice) ?? zero(),
        );
    const collectedByOperation = new Map<string, Prisma.Decimal>();
    let totalCollected = zero();
    for (const row of [
      ...payments,
      ...standaloneDeposits.map((deposit) => ({
        ...deposit,
        invoiceId: null,
        financeTransaction: null,
      })),
    ]) {
      const amount = dzd(
        row.amount,
        row.currency,
        row.financeTransaction?.amountDzd,
      );
      if (!row.financeTransaction)
        warnings.push(
          'Paiement historique sans projection Journal : rapprochement requis.',
        );
      totalCollected = totalCollected.add(amount);
      const operationKey =
        row.dossierId ?? row.orderId ?? row.invoiceId ?? row.id;
      collectedByOperation.set(
        operationKey,
        (collectedByOperation.get(operationKey) ?? zero()).add(amount),
      );
    }
    let totalOutstanding = zero();
    for (const [id, amount] of obligations)
      totalOutstanding = totalOutstanding.add(
        Prisma.Decimal.max(amount.sub(collectedByOperation.get(id) ?? 0), 0),
      );
    let directCosts = zero();
    let operatingCosts = zero();
    for (const row of costs) {
      const amount = dzd(row.amount, row.currency, row.amountInBaseCurrency);
      if (row.costScope === 'DIRECT') directCosts = directCosts.add(amount);
      else operatingCosts = operatingCosts.add(amount);
    }
    // Recognition is tied to completed/delivered operations, never a quotation or unpaid draft.
    const recognizedRevenue = dossiers
      .filter((d) =>
        ['deliveredToClient', 'closed', 'serviceCompleted'].includes(d.status),
      )
      .reduce((sum, d) => sum.add(obligations.get(d.id) ?? 0), zero());
    const estimatedMargin = dossiers
      .filter((d) => d.status !== 'cancelled')
      .reduce(
        (sum, d) =>
          sum.add(d.commercialQuotationRevision?.estimatedProfitDzd ?? 0),
        zero(),
      );
    const grossProfit = recognizedRevenue.sub(directCosts);
    return {
      baseCurrency: 'DZD',
      totalContracted: totalContracted.toString(),
      totalInvoiced: totalInvoiced.toString(),
      totalCollected: totalCollected.toString(),
      totalOutstanding: totalOutstanding.toString(),
      totalCosts: directCosts.add(operatingCosts).toString(),
      directCosts: directCosts.toString(),
      operatingCosts: operatingCosts.toString(),
      recognizedRevenue: recognizedRevenue.toString(),
      estimatedMargin: estimatedMargin.toString(),
      grossProfit: grossProfit.toString(),
      operatingResult: grossProfit.sub(operatingCosts).toString(),
      contractCount: contracts.length,
      invoiceCount: invoices.length,
      paymentCount: payments.length + standaloneDeposits.length,
      costCount: costs.length,
      dataQuality: {
        complete: warnings.length === 0,
        warnings: [...new Set(warnings)],
      },
    };
  }
}
