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
        contracts: {
          where: { archivedAt: null, status: { in: ['SIGNED', 'DRAFT'] } },
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
          where: { status: { not: 'VOIDED' } },
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
            payments: {
              where: { status: 'CONFIRMED' },
              include: { financeTransaction: true },
            },
          },
        },
        costs: {
          where: { status: 'POSTED' },
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

    // Confirmed Collected Revenue
    const totalCollected = dossier.payments.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal(0),
    );

    const outstandingBalance = totalRevenue.minus(totalCollected);
    const paymentPercentage = totalRevenue.greaterThan(0)
      ? Prisma.Decimal.min(
          totalCollected.mul(100).div(totalRevenue),
          100,
        ).toDecimalPlaces(2)
      : new Prisma.Decimal(0);
    const paymentState = totalCollected.lessThanOrEqualTo(0)
      ? 'UNPAID'
      : totalCollected.greaterThan(totalRevenue)
        ? 'OVERPAID_DEPOSIT'
        : totalCollected.greaterThanOrEqualTo(totalRevenue)
          ? 'PAID'
          : 'PARTIALLY_PAID';

    // Installments & Gates breakdown
    let upfrontRequired = new Prisma.Decimal(0);
    let upfrontCollected = new Prisma.Decimal(0);
    let finalRequired = new Prisma.Decimal(0);
    let finalCollected = new Prisma.Decimal(0);

    if (activePlan && activePlan.installments.length > 0) {
      const firstInst = activePlan.installments[0];
      upfrontRequired = firstInst.amount;
      upfrontCollected = firstInst.paidAmount;

      if (activePlan.installments.length > 1) {
        const secondInst = activePlan.installments[1];
        finalRequired = secondInst.amount;
        finalCollected = secondInst.paidAmount;
      }
    } else {
      upfrontRequired = commercialContract?.requiredDeposit ?? new Prisma.Decimal(0);
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
      const baseAmount = cost.amountInBaseCurrency || cost.amount;
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

    // A purchase is a committed dossier cost even before it is fully paid. A
    // linked POSTED cost remains authoritative when present; otherwise use the
    // immutable purchase snapshot so profitability is not understated.
    let totalSupplierCommitted = new Prisma.Decimal(0);
    let totalSupplierPaid = new Prisma.Decimal(0);

    for (const p of dossier.purchases) {
      const purchaseRate =
        p.currency === 'DZD'
          ? new Prisma.Decimal(1)
          : await this.exchangeRates.findEffectiveRate(
              organizationId,
              'DZD',
              p.currency,
              p.purchaseDate ?? p.createdAt,
            );
      const committedBase = p.purchasePrice.mul(purchaseRate).toDecimalPlaces(2);
      totalSupplierCommitted = totalSupplierCommitted.add(committedBase);

      const hasPostedPurchaseCost = dossier.costs.some(
        (cost) =>
          cost.purchaseId === p.id &&
          (cost.type === 'PURCHASE' || cost.type === 'SUPPLIER'),
      );
      if (!hasPostedPurchaseCost) {
        purchaseCost = purchaseCost.add(committedBase);
        totalCostBase = totalCostBase.add(committedBase);
      }

      const paidBase = p.payments.reduce(
        (sum, sp) =>
          sum.add(
            sp.financeTransaction?.amountDzd ??
              (p.currency === 'DZD' ? sp.amount : new Prisma.Decimal(0)),
          ),
        new Prisma.Decimal(0),
      );
      totalSupplierPaid = totalSupplierPaid.add(paidBase);
    }

    // Revenue converted to Base Currency (DZD) for Margin
    let totalRevenueBase = totalRevenue;
    if (currency !== 'DZD') {
      const rate = await this.exchangeRates.findEffectiveRate(
        organizationId,
        'DZD',
        currency,
        commercialContract?.signedAt ?? commercialContract?.createdAt,
      );
      totalRevenueBase = totalRevenue.mul(rate).toDecimalPlaces(2);
    }

    const grossMargin = totalRevenueBase.minus(totalCostBase);
    const grossMarginPercentage = totalRevenueBase.greaterThan(0)
      ? grossMargin.mul(100).dividedBy(totalRevenueBase).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    return {
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
        outstanding: totalSupplierCommitted.minus(totalSupplierPaid).toString(),
      },
      profitability: {
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
    const [contracts, transactions] = await Promise.all([
      this.prisma.contract.findMany({
        where: { organizationId, archivedAt: null, status: 'SIGNED' },
      }),
      this.prisma.financeTransaction.findMany({
        where: { organizationId, status: 'VALIDATED' },
        select: {
          direction: true,
          type: true,
          amountDzd: true,
          customerPaymentId: true,
          supplierPaymentId: true,
          costId: true,
        },
      }),
    ]);

    let totalContracted = new Prisma.Decimal(0);
    for (const contract of contracts) {
      const rate =
        contract.currency === 'DZD'
          ? new Prisma.Decimal(1)
          : await this.exchangeRates.findEffectiveRate(
              organizationId,
              'DZD',
              contract.currency,
              contract.signedAt ?? contract.createdAt,
            );
      totalContracted = totalContracted.add(contract.totalAmount.mul(rate));
    }
    const totalCollected = transactions
      .filter((transaction) => transaction.customerPaymentId)
      .reduce(
      (sum, transaction) => sum.add(transaction.amountDzd),
      new Prisma.Decimal(0),
    );
    const totalCosts = transactions
      // Costs measure profitability. Supplier payments are cash settlement of
      // those liabilities and must not be counted a second time.
      .filter(
        (transaction) => transaction.direction === 'DEBIT' && transaction.costId,
      )
      .reduce(
      (sum, transaction) => sum.add(transaction.amountDzd),
      new Prisma.Decimal(0),
    );

    const outstanding = totalContracted.minus(totalCollected);
    const grossProfit = totalContracted.minus(totalCosts);

    return {
      baseCurrency: 'DZD',
      totalContracted: totalContracted.toString(),
      totalInvoiced: totalContracted.toString(),
      totalCollected: totalCollected.toString(),
      totalOutstanding: outstanding.greaterThan(0)
        ? outstanding.toString()
        : '0.00',
      totalCosts: totalCosts.toString(),
      grossProfit: grossProfit.toString(),
      contractCount: contracts.length,
      invoiceCount: 0,
      paymentCount: transactions.filter((entry) => entry.customerPaymentId)
        .length,
      costCount: transactions.filter(
        (entry) => entry.costId,
      ).length,
    };
  }
}
