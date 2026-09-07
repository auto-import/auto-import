import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../finance/exchange-rates.service';
import { QuotationPricingService } from './quotation-pricing.service';
import { QuotationsService } from './quotations.service';

describe('QuotationsService commercial publication', () => {
  const pricing = () =>
    new QuotationPricingService(new ExchangeRatesService({} as never));

  it('preserves multiple quotations and makes the latest same-basis one active', async () => {
    let sequence = 0;
    const quotationCreates: Array<{ id: string }> = [];
    const revisionCreates: Array<Record<string, unknown>> = [];
    const catalogueUpdates: Array<Record<string, unknown>> = [];
    const tx = {
      chinaOffer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'offer-1',
          currentRevisionId: 'offer-revision-1',
          vehicles: [
            {
              id: 'offer-vehicle-1',
              lineNumber: 1,
              supplierPrice: new Prisma.Decimal(8_000),
              currency: 'USD',
              status: 'VALIDATED',
              quantity: 5,
              purchasedQuantity: 0,
            },
          ],
        }),
      },
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rate-1',
          rate: new Prisma.Decimal(140),
        }),
      },
      commerceSequence: {
        upsert: jest.fn().mockImplementation(() => ({ value: ++sequence })),
      },
      customerQuotation: {
        create: jest.fn().mockImplementation(() => {
          const created = { id: `quotation-${quotationCreates.length + 1}` };
          quotationCreates.push(created);
          return created;
        }),
        update: jest.fn().mockImplementation(({ where }) => ({
          id: where.id,
          currentRevision: {},
        })),
      },
      customerQuotationRevision: {
        create: jest.fn().mockImplementation(({ data }) => {
          revisionCreates.push(data);
          return { id: `revision-${data.quotationId}` };
        }),
      },
      catalogueItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ update }) => {
          catalogueUpdates.push(update);
          return {};
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new QuotationsService(prisma as never, pricing());
    const input = {
      sourceOfferId: 'offer-1',
      sourceOfferVehicleId: 'offer-vehicle-1',
      priceBasis: 'CIF' as const,
      currency: 'DZD',
      vehicleAmount: 8_000,
      vehicleCurrency: 'USD',
      containerPrice: 6_000,
      containerCurrency: 'USD',
      containerAllocation: 3 as const,
      insuranceAmount: 300,
      insuranceCurrency: 'USD',
      customsAmount: 1_000,
      transitAmount: 200,
      transitCurrency: 'USD',
      sellingPriceDzd: 2_000_000,
      otherCosts: [
        { amount: 500, currency: 'USD', description: 'Manutention' },
      ],
    };

    await service.create('org-1', 'user-1', input);
    await service.create('org-1', 'user-1', input);
    await service.create('org-1', 'user-1', input);

    expect(quotationCreates.map(({ id }) => id)).toEqual([
      'quotation-1',
      'quotation-2',
      'quotation-3',
    ]);
    expect(
      catalogueUpdates.map((update) => update.activeCifQuotationId),
    ).toEqual(['quotation-1', 'quotation-2', 'quotation-3']);
    expect(revisionCreates[0]).toEqual(
      expect.objectContaining({
        vehicleAmount: new Prisma.Decimal(8_000),
        freightAmount: new Prisma.Decimal(2_000),
        otherCostsAmount: new Prisma.Decimal(70_000),
        finalCustomerPrice: new Prisma.Decimal(2_000_000),
        finalCustomerPriceDzd: new Prisma.Decimal(2_000_000),
        estimatedTotalCostDzd: new Prisma.Decimal(1_540_000),
        estimatedProfitDzd: new Prisma.Decimal(460_000),
        exchangeRateSnapshot: new Prisma.Decimal(140),
        costItems: {
          create: [
            expect.objectContaining({
              costType: 'VEHICLE',
              originalAmount: new Prisma.Decimal(8_000),
              amountDzd: new Prisma.Decimal(1_120_000),
            }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.objectContaining({ costType: 'OTHER' }),
            expect.objectContaining({ costType: 'CUSTOMS' }),
          ],
        },
      }),
    );

    tx.catalogueItem.upsert.mockRejectedValueOnce(
      new Error('catalogue synchronization failed'),
    );
    await expect(service.create('org-1', 'user-1', input)).rejects.toThrow(
      'catalogue synchronization failed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(3);
  });

  it('creates a missing legacy offer revision inside the publication transaction', async () => {
    const sourceVehicle = {
      id: 'offer-vehicle-legacy',
      lineNumber: 1,
      supplierPrice: new Prisma.Decimal(8_000),
      currency: 'USD',
      status: 'VALIDATED',
      quantity: 1,
      purchasedQuantity: 0,
    };
    const tx = {
      chinaOffer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'offer-legacy',
          currentRevisionId: null,
          supplierPrice: new Prisma.Decimal(8_000),
          purchasePrice: new Prisma.Decimal(8_000),
          currency: 'USD',
          incoterm: 'FOB',
          localCost: new Prisma.Decimal(0),
          totalOfferPrice: new Prisma.Decimal(8_000),
          location: null,
          availableQuantity: 1,
          leadTimeDays: null,
          estimatedDelayDays: null,
          validFrom: new Date('2026-01-01'),
          validUntil: new Date('2027-01-01'),
          paymentConditions: null,
          brand: 'Geely',
          model: 'Coolray',
          version: null,
          year: 2026,
          condition: 'new',
          mileage: 0,
          specification: {},
          vehicles: [sourceVehicle],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      chinaOfferRevision: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _max: { revisionNumber: null } }),
        create: jest.fn().mockResolvedValue({ id: 'legacy-revision-1' }),
      },
      exchangeRate: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rate-1',
          rate: new Prisma.Decimal(250),
        }),
      },
      commerceSequence: {
        upsert: jest.fn().mockResolvedValue({ value: 1 }),
      },
      customerQuotation: {
        create: jest.fn().mockResolvedValue({ id: 'quotation-legacy' }),
        update: jest.fn().mockResolvedValue({
          id: 'quotation-legacy',
          currentRevision: {},
        }),
      },
      customerQuotationRevision: {
        create: jest.fn().mockResolvedValue({ id: 'quotation-revision-1' }),
      },
      catalogueItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    };
    const service = new QuotationsService(prisma as never, pricing());

    await service.create('org-1', 'user-1', {
      sourceOfferId: 'offer-legacy',
      sourceOfferVehicleId: sourceVehicle.id,
      priceBasis: 'DDP',
      currency: 'DZD',
      vehicleAmount: 8_000,
      vehicleCurrency: 'USD',
      containerPrice: 6_000,
      containerCurrency: 'USD',
      containerAllocation: 3,
      insuranceAmount: 300,
      insuranceCurrency: 'USD',
      customsAmount: 1_000,
      transitAmount: 200,
      transitCurrency: 'USD',
      sellingPriceDzd: 3_000_000,
      otherCosts: [
        { amount: 500, currency: 'USD', description: 'Manutention' },
      ],
    });

    expect(tx.chinaOfferRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revisionNumber: 1,
          reason: 'Base historique créée lors du premier devis',
        }),
      }),
    );
    expect(tx.chinaOffer.update).toHaveBeenCalledWith({
      where: { id: 'offer-legacy' },
      data: { currentRevisionId: 'legacy-revision-1' },
    });
    expect(tx.customerQuotation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceOfferRevisionId: 'legacy-revision-1',
        }),
      }),
    );
    expect(tx.catalogueItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          activeDdpQuotationId: 'quotation-legacy',
        }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
