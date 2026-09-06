import { Prisma } from '@prisma/client';
import { QuotationPricingService } from './quotation-pricing.service';
import { QuotationsService } from './quotations.service';

describe('QuotationsService commercial publication', () => {
  it('preserves multiple quotations and makes the latest same-basis one active', async () => {
    let sequence = 0;
    const quotationCreates: Array<{ id: string }> = [];
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
        create: jest.fn().mockImplementation(({ data }) => ({
          id: `revision-${data.quotationId}`,
        })),
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
    const service = new QuotationsService(
      prisma as never,
      new QuotationPricingService(),
    );
    const input = {
      sourceOfferId: 'offer-1',
      sourceOfferVehicleId: 'offer-vehicle-1',
      priceBasis: 'CIF' as const,
      currency: 'USD',
      vehicleAmount: 8_000,
      containerPrice: 6_000,
      containerAllocation: 3 as const,
    };

    await service.create('org-1', 'user-1', input);
    await service.create('org-1', 'user-1', input);
    await service.create('org-1', 'user-1', input);

    expect(quotationCreates.map(({ id }) => id)).toEqual([
      'quotation-1',
      'quotation-2',
      'quotation-3',
    ]);
    expect(catalogueUpdates.map((update) => update.activeCifQuotationId)).toEqual(
      ['quotation-1', 'quotation-2', 'quotation-3'],
    );
  });
});
