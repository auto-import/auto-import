import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DossierStatus, VehicleStatus } from '@auto-import/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { activeDossierWhere } from '../dossiers/dossier-scope';
const OPEN_TASK_STATUSES = ['todo', 'in_progress'];

type KpiRange = {
  from: Date;
  to: Date;
  timezone: string;
  baseCurrency: string;
};

@Injectable()
export class ErpKpiService {
  constructor(private readonly prisma: PrismaService) {}

  async build(organizationId: string, range: KpiRange) {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1),
    );
    const dueSoonDays = this.positiveInteger(
      process.env.SUPPLIER_PAYMENT_DUE_SOON_DAYS,
      7,
    );
    const documentWarningDays = this.positiveInteger(
      process.env.DOCUMENT_EXPIRY_WARNING_DAYS,
      30,
    );
    const supplierDueLimit = new Date(now.getTime() + dueSoonDays * 86_400_000);
    const documentExpiryLimit = new Date(
      now.getTime() + documentWarningDays * 86_400_000,
    );
    const period = { gte: range.from, lte: range.to };
    const currentMonth = { gte: monthStart, lte: range.to };
    const activeDossiers = activeDossierWhere(organizationId);

    const [
      dossierTotal,
      dossierActive,
      dossiersByStatus,
      dossiersByType,
      vehiclesByStatus,
      vehiclesBySource,
      offersByStatus,
      contracts,
      invoices,
      periodTransactions,
      supplierTransactions,
      purchasedVehicles,
      deliveredHistory,
      overdueDossierTasks,
      supplierPaymentsDue,
      leadsThisMonth,
      qualifiedLeads,
      convertedLeads,
      signedLeadContracts,
      appointments,
      calls,
      missedCalls,
      callDuration,
      activeCustomsFiles,
      unmetDossierGates,
      overdueInvoices,
      lateShipments,
      blockedCustoms,
      expiringDocuments,
      overdueTasks,
      recentDossiers,
      recentAudit,
    ] = await Promise.all([
      this.prisma.dossier.count({
        where: { organizationId, openedAt: period },
      }),
      this.prisma.dossier.count({ where: activeDossiers }),
      this.prisma.dossier.groupBy({
        by: ['status'],
        where: { organizationId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.dossier.groupBy({
        by: ['type'],
        where: { organizationId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['acquisitionType'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.chinaOffer.groupBy({
        by: ['status'],
        where: { organizationId, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.contract.findMany({
        where: {
          organizationId,
          status: 'SIGNED',
          archivedAt: null,
          signedAt: period,
        },
        select: { id: true, totalAmount: true, currency: true, signedAt: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { notIn: ['DRAFT', 'VOIDED'] },
          issueDate: { lte: range.to },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paidAmount: true,
          currency: true,
          dueDate: true,
          issueDate: true,
        },
      }),
      this.prisma.financeTransaction.findMany({
        where: {
          organizationId,
          status: 'VALIDATED',
          occurredAt: period,
          OR: [
            { customerPaymentId: { not: null } },
            { cost: { is: { status: 'POSTED', costScope: 'DIRECT' } } },
          ],
        },
        select: {
          id: true,
          sourceModule: true,
          customerPaymentId: true,
          costId: true,
          amountDzd: true,
          occurredAt: true,
        },
      }),
      this.prisma.financeTransaction.findMany({
        where: {
          organizationId,
          status: 'VALIDATED',
          sourceModule: { in: ['PURCHASE_COMMITMENT', 'SUPPLIER_PAYMENT'] },
        },
        select: { sourceModule: true, amountDzd: true },
      }),
      this.prisma.purchase.count({
        where: { organizationId, status: 'confirmed' },
      }),
      this.prisma.dossierStatusHistory.findMany({
        where: {
          dossier: { organizationId },
          toStatus: DossierStatus.DELIVERED_TO_CLIENT,
          createdAt: currentMonth,
        },
        select: { dossierId: true },
      }),
      this.prisma.task.findMany({
        where: {
          organizationId,
          dossierId: { not: null },
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lt: now },
        },
        select: { dossierId: true },
      }),
      this.prisma.supplierPayment.findMany({
        where: {
          organizationId,
          status: 'pending',
          paymentDate: { lte: supplierDueLimit },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          paymentDate: true,
          supplier: { select: { name: true } },
        },
        orderBy: { paymentDate: 'asc' },
        take: 50,
      }),
      this.prisma.prospect.count({
        where: { organizationId, archivedAt: null, createdAt: currentMonth },
      }),
      this.prisma.prospect.count({
        where: {
          organizationId,
          archivedAt: null,
          createdAt: currentMonth,
          OR: [
            { qualification: { in: ['HOT', 'WARM'] } },
            { crmStatus: { in: ['QUALIFIED', 'APPOINTMENT', 'CONVERTED'] } },
          ],
        },
      }),
      this.prisma.prospect.count({
        where: {
          organizationId,
          archivedAt: null,
          createdAt: currentMonth,
          crmStatus: 'CONVERTED',
        },
      }),
      this.prisma.contract.findMany({
        where: {
          organizationId,
          status: 'SIGNED',
          archivedAt: null,
          signedAt: currentMonth,
          prospectId: { not: null },
        },
        distinct: ['prospectId'],
        select: { prospectId: true },
      }),
      this.prisma.appointment.count({
        where: { organizationId, scheduledStart: period },
      }),
      this.prisma.callSession.count({
        where: { organizationId, receivedAt: period },
      }),
      this.prisma.callSession.count({
        where: { organizationId, receivedAt: period, state: 'MISSED' },
      }),
      this.prisma.callSession.aggregate({
        where: { organizationId, receivedAt: period },
        _sum: { durationSeconds: true },
      }),
      this.prisma.customsFile.count({
        where: {
          organizationId,
          status: { notIn: ['released', 'cleared', 'rejected'] },
        },
      }),
      this.prisma.paymentPlan.count({
        where: {
          organizationId,
          status: 'active',
          installments: { some: { status: { not: 'PAID' } } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          status: { notIn: ['DRAFT', 'VOIDED', 'PAID'] },
          dueDate: { lt: now },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paidAmount: true,
          currency: true,
          dueDate: true,
        },
        orderBy: { dueDate: 'asc' },
        take: 50,
      }),
      this.prisma.shipment.findMany({
        where: {
          organizationId,
          eta: { lt: now },
          status: { notIn: ['arrived', 'delivered', 'cancelled'] },
        },
        select: { id: true, shipmentNumber: true, eta: true, status: true },
        orderBy: { eta: 'asc' },
        take: 50,
      }),
      this.prisma.customsFile.findMany({
        where: {
          organizationId,
          OR: [{ status: 'rejected' }, { reconciliationRequired: true }],
        },
        select: { id: true, reference: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'asc' },
        take: 50,
      }),
      this.prisma.gedDocument.findMany({
        where: {
          organizationId,
          archivedAt: null,
          expiryDate: { lte: documentExpiryLimit },
        },
        select: { id: true, title: true, expiryDate: true },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      }),
      this.prisma.task.findMany({
        where: {
          organizationId,
          status: { in: OPEN_TASK_STATUSES },
          dueDate: { lt: now },
        },
        select: { id: true, title: true, dueDate: true, dossierId: true },
        orderBy: { dueDate: 'asc' },
        take: 50,
      }),
      this.prisma.dossier.findMany({
        where: { organizationId },
        take: 6,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          reference: true,
          status: true,
          type: true,
          updatedAt: true,
          client: { select: { firstName: true, lastName: true } },
          dossierVehicles: {
            take: 3,
            orderBy: { assignedAt: 'asc' },
            select: {
              vehicle: { select: { brand: true, model: true, year: true } },
            },
          },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
        },
      }),
    ]);

    const zero = () => new Prisma.Decimal(0);
    const sum = (values: Prisma.Decimal[]) =>
      values.reduce((total, value) => total.add(value), zero());
    const conversionIssues = new Set<string>();
    const contractRevenue = sum(
      contracts
        .filter((contract) => {
          if (contract.currency === range.baseCurrency) return true;
          conversionIssues.add(`contract:${contract.id}:${contract.currency}`);
          return false;
        })
        .map((contract) => contract.totalAmount),
    );
    const collections = periodTransactions.filter(
      (transaction) => transaction.customerPaymentId !== null,
    );
    const costs = periodTransactions.filter(
      (transaction) => transaction.costId !== null,
    );
    const collected = sum(collections.map((item) => item.amountDzd));
    const totalCosts = sum(costs.map((item) => item.amountDzd));
    const outstanding = sum(
      invoices.map((invoice) => {
        if (invoice.currency !== range.baseCurrency) {
          conversionIssues.add(`invoice:${invoice.id}:${invoice.currency}`);
          return zero();
        }
        return Prisma.Decimal.max(invoice.total.minus(invoice.paidAmount), 0);
      }),
    );
    const supplierCommitted = sum(
      supplierTransactions
        .filter((item) => item.sourceModule === 'PURCHASE_COMMITMENT')
        .map((item) => item.amountDzd),
    );
    const supplierPaid = sum(
      supplierTransactions
        .filter((item) => item.sourceModule === 'SUPPLIER_PAYMENT')
        .map((item) => item.amountDzd),
    );

    const trend = new Map<
      string,
      {
        collections: Prisma.Decimal;
        costs: Prisma.Decimal;
        revenue: Prisma.Decimal;
      }
    >();
    const monthKey = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: range.timezone,
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(date);
      return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
    };
    const bucket = (date: Date) => {
      const key = monthKey(date);
      const current = trend.get(key) ?? {
        collections: zero(),
        costs: zero(),
        revenue: zero(),
      };
      trend.set(key, current);
      return current;
    };
    contracts.forEach((contract) => {
      if (contract.signedAt && contract.currency === range.baseCurrency)
        bucket(contract.signedAt).revenue = bucket(
          contract.signedAt,
        ).revenue.add(contract.totalAmount);
    });
    collections.forEach((item) => {
      bucket(item.occurredAt).collections = bucket(
        item.occurredAt,
      ).collections.add(item.amountDzd);
    });
    costs.forEach((item) => {
      bucket(item.occurredAt).costs = bucket(item.occurredAt).costs.add(
        item.amountDzd,
      );
    });

    const vehicleStatus = Object.fromEntries(
      vehiclesByStatus.map((item) => [item.status, item._count._all]),
    );
    const actionableOverdueInvoices = overdueInvoices.filter((item) =>
      item.total.minus(item.paidAmount).gt(0),
    );
    const alerts = [
      ...actionableOverdueInvoices.map((item) => ({
        id: item.id,
        kind: 'CLIENT_PAYMENT_OVERDUE',
        severity: 'critical',
        title: `Paiement client en retard · ${item.invoiceNumber}`,
        detail: `${item.total.minus(item.paidAmount).toFixed(2)} ${item.currency} restant`,
        href: '/facturation',
        dueAt: item.dueDate?.toISOString() ?? null,
      })),
      ...supplierPaymentsDue.map((item) => ({
        id: item.id,
        kind: 'SUPPLIER_PAYMENT_DUE',
        severity: 'warning',
        title: `Paiement fournisseur · ${item.supplier.name}`,
        detail: `${item.amount.toFixed(2)} ${item.currency}`,
        href: '/finance',
        dueAt: item.paymentDate?.toISOString() ?? null,
      })),
      ...lateShipments.map((item) => ({
        id: item.id,
        kind: 'SHIPMENT_LATE',
        severity: 'warning',
        title: `Expédition en retard · ${item.shipmentNumber}`,
        detail: `Statut ${item.status}`,
        href: '/expeditions',
        dueAt: item.eta?.toISOString() ?? null,
      })),
      ...blockedCustoms.map((item) => ({
        id: item.id,
        kind: 'CUSTOMS_BLOCKED',
        severity: 'critical',
        title: `Dossier douane bloqué · ${item.reference}`,
        detail: `Statut ${item.status}`,
        href: '/expeditions',
        dueAt: item.updatedAt.toISOString(),
      })),
      ...expiringDocuments.map((item) => ({
        id: item.id,
        kind: 'DOCUMENT_EXPIRING',
        severity: 'warning',
        title: `Document expirant · ${item.title}`,
        detail: 'Échéance documentaire à traiter',
        href: '/documents',
        dueAt: item.expiryDate?.toISOString() ?? null,
      })),
      ...overdueTasks.map((item) => ({
        id: item.id,
        kind: 'TASK_OVERDUE',
        severity: 'warning',
        title: `Tâche en retard · ${item.title}`,
        detail: 'Tâche non terminée après son échéance',
        href: '/tasks',
        dueAt: item.dueDate?.toISOString() ?? null,
      })),
    ];

    return {
      period: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timezone: range.timezone,
        baseCurrency: range.baseCurrency,
      },
      dossiers: {
        total: dossierTotal,
        active: dossierActive,
        overdue: new Set(overdueDossierTasks.map((item) => item.dossierId))
          .size,
        byStatus: Object.fromEntries(
          dossiersByStatus.map((item) => [item.status, item._count._all]),
        ),
        byType: Object.fromEntries(
          dossiersByType.map((item) => [item.type, item._count._all]),
        ),
      },
      vehicles: {
        purchased: purchasedVehicles,
        inTransit: vehicleStatus[VehicleStatus.IN_TRANSIT] ?? 0,
        inCustoms: vehicleStatus[VehicleStatus.IN_CUSTOMS] ?? 0,
        deliveredThisMonth: new Set(
          deliveredHistory.map((item) => item.dossierId),
        ).size,
        byStatus: vehicleStatus,
        bySource: Object.fromEntries(
          vehiclesBySource.map((item) => [
            item.acquisitionType,
            item._count._all,
          ]),
        ),
      },
      finance: {
        contractsSignedThisMonth: contracts.filter(
          (item) => item.signedAt && item.signedAt >= monthStart,
        ).length,
        issued: contractRevenue.toFixed(2),
        collected: collected.toFixed(2),
        outstanding: outstanding.toFixed(2),
        overdueInvoices: actionableOverdueInvoices.length,
        costs: totalCosts.toFixed(2),
        grossMargin: contractRevenue.minus(totalCosts).toFixed(2),
        supplierPaymentsDue: supplierPaymentsDue.length,
        supplierOutstanding: Prisma.Decimal.max(
          supplierCommitted.minus(supplierPaid),
          0,
        ).toFixed(2),
        conversionIssues: [...conversionIssues].sort(),
        trend: [...trend.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([month, value]) => ({
            month,
            revenue: value.revenue.toFixed(2),
            collections: value.collections.toFixed(2),
            costs: value.costs.toFixed(2),
            grossMargin: value.revenue.minus(value.costs).toFixed(2),
          })),
      },
      offers: {
        byStatus: Object.fromEntries(
          offersByStatus.map((item) => [item.status, item._count._all]),
        ),
      },
      crm: {
        leadsThisMonth,
        activeLeads: leadsThisMonth,
        qualifiedLeads,
        conversions: signedLeadContracts.length,
        conversionRate:
          qualifiedLeads === 0
            ? 0
            : (signedLeadContracts.length / qualifiedLeads) * 100,
        funnel: {
          leads: leadsThisMonth,
          qualified: qualifiedLeads,
          converted: convertedLeads,
          contractsSigned: signedLeadContracts.length,
        },
        appointments,
      },
      callCenter: {
        calls,
        missedCalls,
        durationSeconds: callDuration._sum.durationSeconds ?? 0,
      },
      logistics: { lateShipments: lateShipments.length, activeCustomsFiles },
      alerts: {
        overdueTasks: overdueTasks.length,
        overdueCallbacks: overdueTasks.filter((item) => item.dossierId === null)
          .length,
        overdueInvoices: actionableOverdueInvoices.length,
        supplierPaymentsDue: supplierPaymentsDue.length,
        lateShipments: lateShipments.length,
        blockedCustoms: blockedCustoms.length,
        expiringDocuments: expiringDocuments.length,
        unmetDossierGates,
        items: alerts,
      },
      recent: { dossiers: recentDossiers, events: recentAudit },
    };
  }

  private positiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
