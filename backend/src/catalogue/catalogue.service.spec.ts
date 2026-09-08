/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Prisma } from '@prisma/client';
import { CatalogueService } from './catalogue.service';

describe('CatalogueService quotation projection', () => {
  it('returns one vehicle with the active CIF and DDP quotation prices', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'catalogue-1',
        sourceOfferVehicleId: 'offer-vehicle-1',
        status: 'available',
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
          specification: {},
          purchases: [],
          offer: {
            id: 'offer-1',
            reference: 'OFF-001',
            supplier: { id: 'supplier-1', name: 'China Motors' },
            photos: [],
          },
        },
        activeCifQuotation: {
          id: 'quotation-cif',
          quotationNumber: 'DEV-CIF',
          priceBasis: 'CIF',
          currentRevision: {
            finalCustomerPriceDzd: new Prisma.Decimal(2_750_000),
            sellingPriceDzd: new Prisma.Decimal(2_750_000),
            estimatedCifCostDzd: new Prisma.Decimal(2_300_000),
            estimatedLandedCostDzd: new Prisma.Decimal(2_700_000),
            estimatedTotalCostDzd: new Prisma.Decimal(2_300_000),
            estimatedProfitDzd: new Prisma.Decimal(450_000),
            estimatedMarginPercent: new Prisma.Decimal('16.3636'),
            costItems: [],
          },
        },
        activeDdpQuotation: {
          id: 'quotation-ddp',
          quotationNumber: 'DEV-DDP',
          priceBasis: 'DDP',
          currentRevision: {
            finalCustomerPriceDzd: new Prisma.Decimal(3_000_000),
            sellingPriceDzd: new Prisma.Decimal(3_000_000),
            estimatedCifCostDzd: new Prisma.Decimal(2_300_000),
            estimatedLandedCostDzd: new Prisma.Decimal(2_700_000),
            estimatedTotalCostDzd: new Prisma.Decimal(2_700_000),
            estimatedProfitDzd: new Prisma.Decimal(300_000),
            estimatedMarginPercent: new Prisma.Decimal(10),
            costItems: [],
          },
        },
        dossiers: [
          {
            id: 'dossier-1',
            reference: 'DOS-001',
            commercialQuotationId: 'quotation-ddp',
            closedAt: new Date('2026-09-06'),
            costs: [
              {
                amount: new Prisma.Decimal(2_280_000),
                currency: 'DZD',
                amountInBaseCurrency: new Prisma.Decimal(2_280_000),
                status: 'POSTED',
                costScope: 'DIRECT',
              },
            ],
          },
        ],
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
        cifPrice: '2750000',
        ddpPrice: '3000000',
        pricing: expect.objectContaining({
          ddp: expect.objectContaining({
            estimatedProfitDzd: '300000',
            actual: expect.objectContaining({
              totalCostDzd: '2280000',
              profitDzd: '720000',
              marginPercent: '24',
            }),
          }),
        }),
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          AND: expect.arrayContaining([
            {
              OR: [
                {
                  activeCifQuotation: {
                    is: expect.objectContaining({ cataloguePublished: true }),
                  },
                },
                {
                  activeDdpQuotation: {
                    is: expect.objectContaining({ cataloguePublished: true }),
                  },
                },
              ],
            },
          ]),
        }),
      }),
    );
  });
});
