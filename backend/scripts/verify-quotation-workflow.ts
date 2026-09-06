import { PrismaService } from '../src/prisma/prisma.service';
import { QuotationPricingService } from '../src/offers/quotation-pricing.service';
import { QuotationsService } from '../src/offers/quotations.service';

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
        supplierPrice: 8_000,
        purchasePrice: 8_000,
        currency: 'USD',
        incoterm: 'FOB',
        localCost: 0,
        totalOfferPrice: 8_000,
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
            supplierPrice: 8_000,
            currency: 'USD',
            quantity: 2,
            status: 'VALIDATED',
          },
        },
      },
      include: { vehicles: true },
    });
    await prisma.exchangeRate.create({
      data: {
        organizationId: organization.id,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        rate: 250,
        effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
        source: 'workflow verification',
        createdById: user.id,
      },
    });

    const quotations = new QuotationsService(
      prisma,
      new QuotationPricingService(),
    );
    const sourceOfferVehicleId = offer.vehicles[0].id;
    assert(
      (await prisma.catalogueItem.count({
        where: { organizationId: organization.id },
      })) === 0,
      'The vehicle appeared in Catalogue before a quotation was created.',
    );
    const common = {
      sourceOfferId: offer.id,
      sourceOfferVehicleId,
      currency: 'USD' as const,
      vehicleAmount: 8_000,
      containerPrice: 6_000,
      containerAllocation: 3 as const,
      insuranceAmount: 300,
      customsAmount: 1_000,
      transitAmount: 200,
      otherCosts: [{ amount: 500, description: 'Frais de manutention' }],
    };
    const cif = await quotations.create(organization.id, user.id, {
      ...common,
      priceBasis: 'CIF',
    });
    const ddp = await quotations.create(organization.id, user.id, {
      ...common,
      priceBasis: 'DDP',
    });

    const saved = await prisma.customerQuotation.findMany({
      where: { organizationId: organization.id },
      include: { currentRevision: { include: { otherCosts: true } } },
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
      saved[0].currentRevision?.finalCustomerPrice.equals(11_000),
      'CIF USD should equal 11000.',
    );
    assert(
      saved[0].currentRevision?.finalCustomerPriceDzd.equals(2_750_000),
      'CIF DZD should equal 2750000.',
    );
    assert(
      saved[1].currentRevision?.finalCustomerPrice.equals(12_000),
      'DDP USD should equal 12000.',
    );
    assert(
      saved[1].currentRevision?.finalCustomerPriceDzd.equals(3_000_000),
      'DDP DZD should equal 3000000.',
    );
    assert(
      saved.every((item) =>
        item.currentRevision?.exchangeRateSnapshot.equals(250),
      ),
      'Each quotation must preserve the USD/DZD rate snapshot.',
    );
    assert(
      saved.every(
        (item) =>
          item.currentRevision?.otherCosts[0]?.description ===
          'Frais de manutention',
      ),
      'Other-cost descriptions were not persisted.',
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
        cifUsd: saved[0].currentRevision?.finalCustomerPrice.toString(),
        cifDzd: saved[0].currentRevision?.finalCustomerPriceDzd.toString(),
        ddpUsd: saved[1].currentRevision?.finalCustomerPrice.toString(),
        ddpDzd: saved[1].currentRevision?.finalCustomerPriceDzd.toString(),
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
