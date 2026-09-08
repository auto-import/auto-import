import { PrismaService } from '../src/prisma/prisma.service';
import { QuotationPricingService } from '../src/offers/quotation-pricing.service';
import { QuotationsService } from '../src/offers/quotations.service';
import { ExchangeRatesService } from '../src/finance/exchange-rates.service';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDisposableDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, '');
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !database.startsWith('codex_devis_fix_')
  ) {
    throw new Error(
      'This verification only runs against a local codex_devis_fix_* database.',
    );
  }
}

async function main() {
  assertDisposableDatabase();
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const organization = await prisma.organization.create({
      data: { name: 'Quotation verification', type: 'test' },
    });
    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        firstName: 'Test',
        lastName: 'Agent',
        email: `quotation-${organization.id}@example.test`,
        passwordHash: 'not-used',
      },
    });
    const supplier = await prisma.partner.create({
      data: {
        organizationId: organization.id,
        name: 'China Motors Test',
        type: 'supplier',
      },
    });
    const offer = await prisma.chinaOffer.create({
      data: {
        organizationId: organization.id,
        supplierId: supplier.id,
        reference: 'OFF-VERIFY-001',
        brand: 'Geely',
        model: 'Coolray',
        condition: 'new',
        specification: {},
        supplierPrice: 10_000,
        purchasePrice: 10_000,
        currency: 'USD',
        incoterm: 'FOB',
        localCost: 0,
        totalOfferPrice: 10_000,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        validUntil: new Date('2027-12-31T00:00:00.000Z'),
        availableQuantity: 2,
        offerStatus: 'VALIDATED',
        vehicles: {
          create: {
            organizationId: organization.id,
            lineNumber: 1,
            brand: 'Geely',
            model: 'Coolray',
            condition: 'new',
            specification: {},
            supplierPrice: 10_000,
            currency: 'USD',
            quantity: 2,
            status: 'VALIDATED',
          },
        },
      },
      include: { vehicles: true },
    });
    const quotations = new QuotationsService(
      prisma,
      new QuotationPricingService(new ExchangeRatesService(prisma)),
    );
    const sourceOfferVehicleId = offer.vehicles[0].id;
    const common = {
      sourceOfferId: offer.id,
      sourceOfferVehicleId,
      currency: 'DZD',
      vehicleAmount: 10_000,
      vehicleCurrency: 'USD',
      containerPrice: 6_000,
      containerCurrency: 'USD',
      containerAllocation: 3 as const,
      insuranceAmount: 1_500,
      insuranceCurrency: 'USD',
      customsAmount: 500_000,
      transitAmount: 80_000,
      transitCurrency: 'DZD',
      sellingPriceDzd: 2_600_000,
      otherCosts: [],
    };
    let missingRateMessage = '';
    try {
      await quotations.create(organization.id, user.id, {
        ...common,
        priceBasis: 'CIF',
      });
    } catch (error) {
      missingRateMessage =
        error instanceof Error ? error.message : String(error);
    }
    assert(
      missingRateMessage.includes(
        "aucun taux USD vers DZD actif n'est configuré",
      ),
      'A missing Finance rate did not return the expected business error.',
    );
    assert(
      (await prisma.customerQuotation.count({
        where: { organizationId: organization.id },
      })) === 0 &&
        (await prisma.catalogueItem.count({
          where: { organizationId: organization.id },
        })) === 0,
      'A failed quotation left partial quotation or Catalogue data.',
    );
    await prisma.exchangeRate.create({
      data: {
        organizationId: organization.id,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        rate: 145,
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        source: 'workflow verification',
        createdById: user.id,
      },
    });

    assert(
      (await prisma.catalogueItem.count({
        where: { organizationId: organization.id },
      })) === 0,
      'The vehicle appeared in Catalogue before a quotation was created.',
    );
    const cif = await quotations.create(organization.id, user.id, {
      ...common,
      priceBasis: 'CIF',
    });
    const ddp = await quotations.create(organization.id, user.id, {
      ...common,
      priceBasis: 'DDP',
    });

    await prisma.exchangeRate.create({
      data: {
        organizationId: organization.id,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        rate: 160,
        effectiveAt: new Date(),
        source: 'later workflow verification rate',
        createdById: user.id,
      },
    });

    const saved = await prisma.customerQuotation.findMany({
      where: { organizationId: organization.id },
      include: { currentRevision: { include: { costItems: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const catalogue = await prisma.catalogueItem.findUniqueOrThrow({
      where: { sourceOfferVehicleId },
    });
    const refreshedOffer = await prisma.chinaOffer.findUniqueOrThrow({
      where: { id: offer.id },
    });

    assert(saved.length === 2, 'Expected two independent quotations.');
    assert(
      saved[0].currentRevision?.sellingPriceDzd.equals(2_600_000),
      'CIF selling price DZD should equal 2600000.',
    );
    assert(
      saved[0].currentRevision?.estimatedTotalCostDzd.equals(2_037_500),
      'CIF estimated cost DZD should equal 2037500.',
    );
    assert(
      saved[1].currentRevision?.sellingPriceDzd.equals(2_600_000),
      'DDP selling price DZD should equal 2600000.',
    );
    assert(
      saved[1].currentRevision?.estimatedTotalCostDzd.equals(2_537_500),
      'DDP estimated cost DZD should equal 2537500.',
    );
    assert(
      saved.every((item) =>
        item.currentRevision?.exchangeRateSnapshot.equals(145),
      ),
      'Each quotation must preserve the USD/DZD rate snapshot.',
    );
    assert(
      saved[1].currentRevision?.estimatedProfitDzd.equals(62_500) &&
        saved[1].currentRevision?.estimatedMarginPercent.equals('2.4038'),
      'DDP profit and margin should equal 62500 DZD and 2.4038%.',
    );
    assert(
      catalogue.activeCifQuotationId === cif.id &&
        catalogue.activeDdpQuotationId === ddp.id,
      'Catalogue did not retain the active CIF and DDP quotations.',
    );
    assert(
      Boolean(refreshedOffer.currentRevisionId),
      'The legacy offer price revision was not repaired.',
    );

    process.stdout.write(
      JSON.stringify({
        quotations: saved.length,
        catalogueItems: 1,
        cifEstimatedCostDzd:
          saved[0].currentRevision?.estimatedTotalCostDzd.toString(),
        ddpEstimatedCostDzd:
          saved[1].currentRevision?.estimatedTotalCostDzd.toString(),
        sellingPriceDzd: saved[1].currentRevision?.sellingPriceDzd.toString(),
        exchangeRateSnapshot:
          saved[0].currentRevision?.exchangeRateSnapshot.toString(),
      }),
    );
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
