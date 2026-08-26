import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DOSSIER_WORKFLOWS } from '@auto-import/contracts';
import * as dotenv from 'dotenv';
import pg from 'pg';
import {
  PRIMARY_ORG_ID,
  SECONDARY_ORG_ID,
  assertDisposableDatabase,
  readDemoSeedConfig,
  sha256,
} from '../prisma/demo-seed-support';

dotenv.config();

const config = readDemoSeedConfig();
const pool = new pg.Pool({ connectionString: config.connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const failures: string[] = [];
const results: Array<{ invariant: string; result: string }> = [];

function check(name: string, condition: boolean, evidence: string): void {
  if (condition)
    results.push({ invariant: name, result: `PASS — ${evidence}` });
  else {
    results.push({ invariant: name, result: `FAIL — ${evidence}` });
    failures.push(`${name}: ${evidence}`);
  }
}

function equalMoney(left: Prisma.Decimal, right: Prisma.Decimal): boolean {
  return left.toDecimalPlaces(2).equals(right.toDecimalPlaces(2));
}

async function verifyCountsAndTenancy(): Promise<void> {
  const [organizations, primaryUsers, secondaryUsers, primaryCounts] =
    await Promise.all([
      prisma.organization.findMany({
        where: { id: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
      }),
      prisma.user.findMany({
        where: { organizationId: PRIMARY_ORG_ID },
        include: { userRoles: { include: { role: true } } },
      }),
      prisma.user.findMany({
        where: { organizationId: SECONDARY_ORG_ID },
        include: { userRoles: { include: { role: true } } },
      }),
      Promise.all([
        prisma.prospect.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.client.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.callSession.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.whatsappMessage.count({
          where: { organizationId: PRIMARY_ORG_ID },
        }),
        prisma.vehicle.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.chinaOffer.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.dossier.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.invoice.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.shipment.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.customsFile.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.task.count({ where: { organizationId: PRIMARY_ORG_ID } }),
        prisma.notification.count({
          where: { organizationId: PRIMARY_ORG_ID },
        }),
      ]),
    ]);
  check(
    'demo organizations',
    organizations.length === 2,
    `found ${organizations.length}/2`,
  );
  check(
    'role variants',
    primaryUsers.length >= 8 &&
    secondaryUsers.length >= 2 &&
    [...primaryUsers, ...secondaryUsers].every(
      (user) =>
        user.userRoles.length > 0 &&
        user.userRoles.every(
          ({ role }) => role.organizationId === user.organizationId,
        ),
    ),
    `primary=${primaryUsers.length}, secondary=${secondaryUsers.length}`,
  );
  const minimums = [25, 15, 18, 28, 20, 12, 15, 15, 8, 8, 20, 20];
  check(
    'major-domain volume',
    primaryCounts.every((count, index) => count >= minimums[index]),
    `counts=${primaryCounts.join(',')}`,
  );

  const [dossiers, orders, vehicles, files, payments, customsFiles] =
    await Promise.all([
      prisma.dossier.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: { client: true, salesUser: true, opsUser: true, order: true },
      }),
      prisma.order.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: {
          client: true,
          creator: true,
          items: { include: { vehicle: true } },
        },
      }),
      prisma.vehicle.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: {
          supplier: true,
          currentLocation: { include: { warehouse: true } },
        },
      }),
      prisma.fileAsset.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: { uploadedByUser: true },
      }),
      prisma.payment.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: { client: true, dossier: true, order: true, invoice: true },
      }),
      prisma.customsFile.findMany({
        where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
        include: {
          shipment: true,
          vehicle: true,
          dossier: true,
          brokerPartner: true,
        },
      }),
    ]);
  const dossierSafe = dossiers.every(
    (item) =>
      item.client.organizationId === item.organizationId &&
      item.salesUser.organizationId === item.organizationId &&
      (!item.opsUser || item.opsUser.organizationId === item.organizationId) &&
      (!item.order || item.order.organizationId === item.organizationId),
  );
  const orderSafe = orders.every(
    (item) =>
      item.client.organizationId === item.organizationId &&
      item.creator.organizationId === item.organizationId &&
      item.items.every(
        ({ vehicle }) => vehicle.organizationId === item.organizationId,
      ),
  );
  const vehicleSafe = vehicles.every(
    (item) =>
      (!item.supplier ||
        item.supplier.organizationId === item.organizationId) &&
      (!item.currentLocation ||
        item.currentLocation.warehouse.organizationId === item.organizationId),
  );
  const fileSafe = files.every(
    (item) => item.uploadedByUser.organizationId === item.organizationId,
  );
  const paymentSafe = payments.every(
    (item) =>
      item.client.organizationId === item.organizationId &&
      (!item.dossier || item.dossier.organizationId === item.organizationId) &&
      (!item.order || item.order.organizationId === item.organizationId) &&
      (!item.invoice || item.invoice.organizationId === item.organizationId),
  );
  const customsSafe = customsFiles.every((item) =>
    [item.shipment, item.vehicle, item.dossier, item.brokerPartner]
      .filter((parent) => parent !== null)
      .every((parent) => parent?.organizationId === item.organizationId),
  );
  check(
    'tenant relation integrity',
    dossierSafe &&
    orderSafe &&
    vehicleSafe &&
    fileSafe &&
    paymentSafe &&
    customsSafe,
    `dossiers=${dossiers.length}, orders=${orders.length}, files=${files.length}`,
  );
}

async function verifyWorkflowsAndInventory(): Promise<void> {
  const dossiers = await prisma.dossier.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      history: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      notes: true,
    },
  });
  let validHistories = true;
  for (const dossier of dossiers) {
    const actual = dossier.history.map((entry) => entry.toStatus);
    const workflow = DOSSIER_WORKFLOWS[dossier.type];
    const targetPosition = workflow.findIndex(
      (status) => status === dossier.status,
    );
    const expected =
      dossier.status === 'cancelled'
        ? [workflow[0], 'cancelled']
        : workflow.slice(0, targetPosition + 1);
    if (expected.length === 0 || actual.join('|') !== expected.join('|'))
      validHistories = false;
    for (let index = 1; index < dossier.history.length; index += 1) {
      if (
        dossier.history[index].createdAt <
        dossier.history[index - 1].createdAt ||
        dossier.history[index].fromStatus !==
        dossier.history[index - 1].toStatus
      )
        validHistories = false;
    }
  }
  check(
    'dossier workflow histories',
    validHistories,
    `${dossiers.length} canonical histories`,
  );
  check(
    'blocked and ready gates',
    dossiers.some((dossier) =>
      dossier.notes.some((note) =>
        note.content.startsWith('SCENARIO_BLOCKED:'),
      ),
    ) &&
    dossiers.some((dossier) =>
      dossier.notes.some((note) =>
        note.content.startsWith('SCENARIO_READY:'),
      ),
    ),
    'both scenario markers present',
  );
  check(
    'workflow type coverage',
    new Set(dossiers.map((dossier) => dossier.type)).size === 3 &&
    dossiers.some((dossier) => dossier.status === 'cancelled'),
    'CIF, DDP, shipping and cancellation present',
  );

  const offers = await prisma.chinaOffer.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: { reservations: true },
  });
  const offersValid = offers.every(
    (offer) =>
      offer.availableQuantity >= 0 &&
      offer.reservedQuantity >= 0 &&
      offer.reservedQuantity <= offer.availableQuantity &&
      offer.reservations
        .filter((reservation) => reservation.status === 'active')
        .reduce((sum, reservation) => sum + reservation.quantity, 0) <=
      offer.availableQuantity,
  );
  check(
    'offer reservation quantities',
    offersValid,
    `${offers.length} offers without oversubscription`,
  );

  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      stockMovements: {
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  });
  const stockValid = vehicles.every(
    (vehicle) =>
      vehicle.stockMovements.length === 1 &&
      vehicle.stockMovements[0].toLocationId === vehicle.currentLocationId &&
      vehicle.stockMovements[0].organizationId === vehicle.organizationId,
  );
  check(
    'stock location reconciliation',
    stockValid,
    `${vehicles.length} latest movements reconcile`,
  );
}

async function verifyFinance(): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: { items: true, allocations: { where: { status: 'ACTIVE' } } },
  });
  const invoicesValid = invoices.every((invoice) => {
    const itemTotal = invoice.items.reduce(
      (sum, item) => sum.plus(item.total),
      moneyZero(),
    );
    const allocationTotal = invoice.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.amount),
      moneyZero(),
    );
    return (
      equalMoney(itemTotal, invoice.subtotal) &&
      equalMoney(
        invoice.subtotal.plus(invoice.tax).minus(invoice.discount),
        invoice.total,
      ) &&
      equalMoney(allocationTotal, invoice.paidAmount)
    );
  });
  check(
    'invoice reconciliation',
    invoicesValid,
    `${invoices.length} invoice totals and paid amounts`,
  );

  const plans = await prisma.paymentPlan.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      installments: {
        include: { allocations: { where: { status: 'ACTIVE' } } },
      },
    },
  });
  const plansValid = plans.every((plan) => {
    const total = plan.installments.reduce(
      (sum, installment) => sum.plus(installment.amount),
      moneyZero(),
    );
    const paidValid = plan.installments.every((installment) =>
      equalMoney(
        installment.paidAmount,
        installment.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          moneyZero(),
        ),
      ),
    );
    if (plan.strategy === 'FULL_UPFRONT')
      return (
        plan.installments.length === 1 &&
        equalMoney(total, plan.totalAmount) &&
        paidValid
      );
    return (
      plan.installments.length === 2 &&
      equalMoney(total, plan.totalAmount) &&
      equalMoney(
        plan.installments[1].amount,
        plan.totalAmount.minus(plan.installments[0].amount),
      ) &&
      paidValid
    );
  });
  check(
    'payment plan reconciliation',
    plansValid,
    `${plans.length} exact 30/70 or upfront plans`,
  );

  const payments = await prisma.payment.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      allocations: { where: { status: 'ACTIVE' } },
      deposit: true,
      exchangeRate: true,
    },
  });
  const paymentsValid = payments.every((payment) => {
    const allocated = payment.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.amount),
      moneyZero(),
    );
    return (
      equalMoney(allocated, payment.allocatedAmount) &&
      equalMoney(
        payment.allocatedAmount.plus(payment.unallocatedAmount),
        payment.amount,
      ) &&
      payment.allocatedAmount.lessThanOrEqualTo(payment.amount)
    );
  });
  check(
    'payment and allocation reconciliation',
    paymentsValid,
    `${payments.length} payments; pending/failed/reversed excluded by status`,
  );
  const overpayment = payments.find((payment) => payment.deposit !== null);
  check(
    'legitimate deposit',
    Boolean(
      overpayment &&
      overpayment.deposit &&
      equalMoney(
        overpayment.unallocatedAmount,
        overpayment.deposit.unappliedAmount,
      ),
    ),
    overpayment ? `payment=${overpayment.id}` : 'missing overpayment deposit',
  );
  const statusSet = new Set(payments.map((payment) => payment.status));
  check(
    'money status coverage',
    ['PENDING', 'FAILED', 'REVERSED', 'CONFIRMED'].every((status) =>
      statusSet.has(status),
    ),
    [...statusSet].sort().join(','),
  );
  check(
    'historical exchange-rate linkage',
    payments
      .filter(
        (payment) =>
          payment.status === 'CONFIRMED' && payment.currency !== 'DZD',
      )
      .every(
        (payment) =>
          payment.exchangeRate &&
          payment.exchangeRate.effectiveAt <=
          (payment.paymentDate ?? payment.createdAt),
      ),
    'all confirmed foreign payments use an earlier/equal effective rate',
  );

  const [confirmedPayments, postedCosts] = await Promise.all([
    prisma.payment.findMany({
      where: { organizationId: PRIMARY_ORG_ID, status: 'CONFIRMED' },
      include: { exchangeRate: true },
    }),
    prisma.cost.findMany({
      where: { organizationId: PRIMARY_ORG_ID, status: 'POSTED' },
    }),
  ]);
  const collected = confirmedPayments.reduce(
    (sum, payment) =>
      sum.plus(
        payment.currency === 'DZD'
          ? payment.amount
          : payment.exchangeRate
            ? payment.amount.mul(payment.exchangeRate.rate)
            : 0,
      ),
    moneyZero(),
  );
  const costs = postedCosts.reduce(
    (sum, cost) =>
      sum.plus(
        cost.amountInBaseCurrency ??
        (cost.currency === 'DZD' ? cost.amount : 0),
      ),
    moneyZero(),
  );
  check(
    'report source totals',
    collected.greaterThan(0) &&
    costs.greaterThan(0) &&
    confirmedPayments.every((payment) => payment.status === 'CONFIRMED'),
    `collections=${collected.toFixed(2)} DZD, costs=${costs.toFixed(2)} DZD`,
  );
  const marginGroups = await prisma.dossier.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: { invoices: true, costs: { where: { status: 'POSTED' } } },
  });
  const signs = new Set(
    marginGroups.map((dossier) =>
      dossier.invoices
        .reduce((sum, invoice) => sum.plus(invoice.total), moneyZero())
        .minus(
          dossier.costs.reduce(
            (sum, cost) => sum.plus(cost.amountInBaseCurrency ?? 0),
            moneyZero(),
          ),
        )
        .comparedTo(0),
    ),
  );
  check(
    'margin scenario coverage',
    signs.has(-1) && signs.has(0) && signs.has(1),
    `signs=${[...signs].sort().join(',')}`,
  );
}

function moneyZero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

async function verifyLogisticsAndFiles(): Promise<void> {
  const shipments = await prisma.shipment.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      statusHistory: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  const shipmentValid = shipments.every(
    (shipment) =>
      (!shipment.etd || !shipment.eta || shipment.etd <= shipment.eta) &&
      (!shipment.actualDepartureDate ||
        !shipment.actualArrivalDate ||
        shipment.actualDepartureDate <= shipment.actualArrivalDate) &&
      shipment.statusHistory.every(
        (entry, index) =>
          index === 0 ||
          entry.createdAt >= shipment.statusHistory[index - 1].createdAt,
      ),
  );
  const hasCompleted = shipments.some(
    (shipment) => shipment.status === 'delivered',
  );
  const hasLateActive = shipments.some(
    (shipment) =>
      shipment.status === 'inTransit' &&
      shipment.eta !== null &&
      shipment.eta < config.anchor,
  );
  check(
    'shipment chronology',
    shipmentValid && hasCompleted && hasLateActive,
    `${shipments.length} shipments; chronology=${shipmentValid}, completed=${hasCompleted}, late-active=${hasLateActive}`,
  );
  const customs = await prisma.customsFile.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
    include: {
      statusHistory: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  const customsValid = customs.every(
    (file) =>
      (!file.clearedAt || file.clearedAt >= file.openedAt) &&
      (!file.releasedAt ||
        (file.clearedAt !== null && file.releasedAt >= file.clearedAt)) &&
      file.customsAmount?.equals(
        (file.dutyAmount ?? moneyZero())
          .plus(file.taxAmount ?? moneyZero())
          .plus(file.feesAmount ?? moneyZero()),
      ),
  );
  check(
    'customs chronology and valuation',
    customsValid,
    `${customs.length} customs files`,
  );

  const files = await prisma.fileAsset.findMany({
    where: { organizationId: { in: [PRIMARY_ORG_ID, SECONDARY_ORG_ID] } },
  });
  let fileInventoryValid = true;
  for (const file of files) {
    const absolutePath = resolve(
      config.storageRoot,
      ...file.storageKey.split('/'),
    );
    const safePrefix = `${resolve(config.storageRoot)}${sep}`;
    if (
      !absolutePath.startsWith(safePrefix) ||
      file.storageKey.startsWith('/') ||
      /^[a-zA-Z]:/.test(file.storageKey)
    ) {
      fileInventoryValid = false;
      continue;
    }
    try {
      const bytes = await readFile(absolutePath);
      if (BigInt(bytes.length) !== file.size || sha256(bytes) !== file.checksum)
        fileInventoryValid = false;
    } catch {
      fileInventoryValid = false;
    }
  }
  check(
    'private file inventory',
    fileInventoryValid && files.length >= 8,
    `${files.length} assets have matching bytes/checksum/size`,
  );
  const kinds = new Set(
    files
      .filter((file) => file.organizationId === PRIMARY_ORG_ID)
      .map((file) => file.category),
  );
  const expectedKinds = [
    'VEHICLE_PHOTO',
    'BUSINESS_DOCUMENT',
    'DOSSIER_DOCUMENT',
    'PROOF',
    'CONTRACT',
    'CUSTOMS_DOCUMENT',
    'PAYMENT_RECEIPT',
  ];
  check(
    'document category coverage',
    expectedKinds.every((kind) => kinds.has(kind)),
    expectedKinds.join(','),
  );
}

async function verifyNotificationsAuditAndStableKeys(): Promise<void> {
  const notifications = await prisma.notification.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
  });
  const dedupeKeys = notifications
    .map((notification) => notification.dedupeKey)
    .filter((value): value is string => value !== null);
  check(
    'notification deduplication/read states',
    new Set(dedupeKeys).size === dedupeKeys.length &&
    notifications.some((notification) => notification.readAt !== null) &&
    notifications.some((notification) => notification.readAt === null),
    `${notifications.length} unique notifications with read/unread states`,
  );
  const audits = await prisma.auditLog.findMany({
    where: { organizationId: PRIMARY_ORG_ID },
  });
  const forbidden = [
    'password',
    'token',
    'authorization',
    'cookie',
    'secret',
    'filebody',
  ];
  const auditSafe = audits.every(
    (audit) =>
      !forbidden.some((term) =>
        JSON.stringify(audit).toLowerCase().includes(term),
      ),
  );
  check(
    'audit redaction',
    auditSafe,
    `${audits.length} safe append-only demo summaries`,
  );
  const duplicateRefs = await prisma.$queryRaw<Array<{ duplicates: bigint }>>`
    SELECT (
      (SELECT COUNT(*) - COUNT(DISTINCT reference) FROM "Dossier" WHERE "organizationId" = ${PRIMARY_ORG_ID}) +
      (SELECT COUNT(*) - COUNT(DISTINCT "invoiceNumber") FROM "Invoice" WHERE "organizationId" = ${PRIMARY_ORG_ID}) +
      (SELECT COUNT(*) - COUNT(DISTINCT "shipmentNumber") FROM "Shipment" WHERE "organizationId" = ${PRIMARY_ORG_ID}) +
      (SELECT COUNT(*) - COUNT(DISTINCT "idempotencyKey") FROM "Payment" WHERE "organizationId" = ${PRIMARY_ORG_ID} AND "idempotencyKey" IS NOT NULL)
    ) AS duplicates
  `;
  check(
    'stable unique references',
    duplicateRefs[0]?.duplicates === 0n,
    `duplicates=${duplicateRefs[0]?.duplicates ?? -1}`,
  );
}

async function main(): Promise<void> {
  await assertDisposableDatabase(prisma, config);
  await verifyCountsAndTenancy();
  await verifyWorkflowsAndInventory();
  await verifyFinance();
  await verifyLogisticsAndFiles();
  await verifyNotificationsAuditAndStableKeys();
  console.table(results);
  if (failures.length > 0) {
    throw new Error(
      `Demo verification failed (${failures.length}):\n${failures.join('\n')}`,
    );
  }
  console.log(`DEMO_SEED_VERIFY_PASS invariants=${results.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Unknown verification error',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
