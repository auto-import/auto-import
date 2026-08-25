import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from './exchange-rates.service';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async getDossierFinancialSummary(
    dossierId: string,
    organizationId: string,
  ) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: {
        paymentPlans: {
          where: { status: 'active' },
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
          where: { status: { in: ['CONFIRMED', 'PARTIALLY_APPLIED', 'FULLY_APPLIED'] } },
        },
        purchases: {
          include: {
            payments: {
              where: { status: 'CONFIRMED' },
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

    if (activePlan) {
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
      // Default 30% rule if no formal plan created yet
      upfrontRequired = totalRevenue.mul(30).div(100).toDecimalPlaces(2);
      upfrontCollected = totalCollected.greaterThanOrEqualTo(upfrontRequired)
        ? upfrontRequired
        : totalCollected;
      finalRequired = totalRevenue.minus(upfrontRequired);
      finalCollected = totalCollected.greaterThan(upfrontRequired)
        ? totalCollected.minus(upfrontRequired)
        : new Prisma.Decimal(0);
    }

    const upfrontPaid = upfrontCollected.greaterThanOrEqualTo(upfrontRequired) && upfrontRequired.greaterThan(0);
    const finalPaid = outstandingBalance.lessThanOrEqualTo(0) && totalRevenue.greaterThan(0);

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

    // Include purchase prices from linked purchases if not already captured in posted costs
    let totalSupplierCommitted = new Prisma.Decimal(0);
    let totalSupplierPaid = new Prisma.Decimal(0);

    for (const p of dossier.purchases) {
      totalSupplierCommitted = totalSupplierCommitted.add(p.purchasePrice);
      const paid = p.payments.reduce(
        (sum, sp) => sum.add(sp.amount),
        new Prisma.Decimal(0),
      );
      totalSupplierPaid = totalSupplierPaid.add(paid);
    }

    // Revenue converted to Base Currency (DZD) for Margin
    let totalRevenueBase = totalRevenue;
    if (currency !== 'DZD') {
      const rate = await this.exchangeRates.findEffectiveRate(
        organizationId,
        'DZD',
        currency,
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
        outstanding: outstandingBalance.greaterThan(0) ? outstandingBalance.toString() : '0.00',
      },
      gates: {
        strategy: activePlan?.strategy || 'THIRTY_SEVENTY',
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
        committed: totalSupplierCommitted.toString(),
        paid: totalSupplierPaid.toString(),
        outstanding: totalSupplierCommitted.minus(totalSupplierPaid).toString(),
      },
      profitability: {
        grossMargin: grossMargin.toString(),
        grossMarginPercentage: grossMarginPercentage.toString(),
      },
      invoices: dossier.invoices,
      paymentPlan: activePlan,
      payments: dossier.payments,
      recentCosts: dossier.costs,
    };
  }

  async getOrganizationFinancialOverview(organizationId: string) {
    const [invoices, payments, costs] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId, status: { not: 'VOIDED' } },
      }),
      this.prisma.payment.findMany({
        where: { organizationId, status: 'CONFIRMED' },
      }),
      this.prisma.cost.findMany({
        where: { organizationId, status: 'POSTED' },
      }),
    ]);

    const totalInvoiced = invoices.reduce(
      (sum, i) => sum.add(i.total),
      new Prisma.Decimal(0),
    );
    const totalCollected = payments.reduce(
      (sum, p) => sum.add(p.amount),
      new Prisma.Decimal(0),
    );
    const totalCosts = costs.reduce(
      (sum, c) => sum.add(c.amountInBaseCurrency || c.amount),
      new Prisma.Decimal(0),
    );

    const outstanding = totalInvoiced.minus(totalCollected);
    const grossProfit = totalInvoiced.minus(totalCosts);

    return {
      baseCurrency: 'DZD',
      totalInvoiced: totalInvoiced.toString(),
      totalCollected: totalCollected.toString(),
      totalOutstanding: outstanding.greaterThan(0) ? outstanding.toString() : '0.00',
      totalCosts: totalCosts.toString(),
      grossProfit: grossProfit.toString(),
      invoiceCount: invoices.length,
      paymentCount: payments.length,
      costCount: costs.length,
    };
  }
}
