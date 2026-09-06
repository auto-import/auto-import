import { Prisma } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

describe('CatalogueService quotation projection', () => {
  it('returns one vehicle with the active CIF and DDP quotation prices', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'catalogue-1',
        sourceOfferVehicleId: 'offer-vehicle-1',
        activeCifQuotationId: 'quotation-cif',
        activeDdpQuotationId: 'quotation-ddp',
        availableQuantity: 2,
        reservedQuantity: 0,
        publishedAt: new Date('2026-09-06'),
        sourceOfferVehicle: {
          brand: 'Geely',
          model: 'Coolray',
          version: 'GF',
          year: 2026,
          condition: 'new',
          mileage: 0,
          vin: null,
          offer: {
            id: 'offer-1',
            reference: 'OFF-001',
            supplier: { id: 'supplier-1', name: 'China Motors' },
            photos: [],
          },
        },
        activeCifQuotation: {
          currentRevision: {
            finalCustomerPriceDzd: new Prisma.Decimal(2_750_000),
          },
        },
        activeDdpQuotation: {
          currentRevision: {
            finalCustomerPriceDzd: new Prisma.Decimal(3_000_000),
          },
        },
      },
    ]);
    const prisma = {
      catalogueItem: {
        findMany,
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new CatalogueService(prisma as never);

    const result = await service.findAll('org-1', {});

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'catalogue-1',
        sourceOfferVehicleId: 'offer-vehicle-1',
        cifPrice: new Prisma.Decimal(2_750_000),
        ddpPrice: new Prisma.Decimal(3_000_000),
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          AND: expect.arrayContaining([
            {
              OR: [
                { activeCifQuotationId: { not: null } },
                { activeDdpQuotationId: { not: null } },
              ],
            },
          ]),
        }),
      }),
    );
  });
});
