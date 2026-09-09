import { Prisma } from '@prisma/client';
import { ConfigurationService } from './configuration.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Locked dossier pricing snapshots', () => {
  it.each([
    ['VEHICLE_SALE_CIF', 3000000, null],
    ['VEHICLE_SALE_DDP', null, 3500000],
    ['VEHICLE_SALE_DDP', 3000000, 3500000],
  ])(
    'reads %s with CIF=%s / DDP=%s without repricing or writing',
    async (type, cif, ddp) => {
      const prisma = {
        dossier: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'dossier',
            organizationId: 'org',
            type,
            cifPrice: cif == null ? null : new Prisma.Decimal(cif),
            ddpPrice: ddp == null ? null : new Prisma.Decimal(ddp),
            priceCurrency: 'DZD',
            priceLockedAt: new Date(),
          }),
          updateMany: jest.fn(),
        },
      };
      const service = new ConfigurationService(
        prisma as unknown as PrismaService,
      );
      await expect(
        service.refreshDossierPricing('dossier', 'org'),
      ).resolves.toMatchObject({
        available: true,
        locked: true,
        currency: 'DZD',
        missing: [],
      });
      expect(prisma.dossier.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.dossier.updateMany).not.toHaveBeenCalled();
    },
  );

  it('reports an incomplete historical snapshot without fabricating its price', async () => {
    const prisma = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'dossier',
          organizationId: 'org',
          type: 'VEHICLE_SALE_DDP',
          cifPrice: new Prisma.Decimal(3000000),
          ddpPrice: null,
          priceCurrency: null,
          priceLockedAt: new Date(),
        }),
        updateMany: jest.fn(),
      },
    };
    const service = new ConfigurationService(
      prisma as unknown as PrismaService,
    );
    const result = await service.refreshDossierPricing('dossier', 'org');
    expect(result).toMatchObject({
      available: false,
      locked: true,
      ddpPrice: undefined,
    });
    expect(result.missing).toEqual([
      'prix commercial historique',
      'devise du prix historique',
    ]);
    expect(prisma.dossier.updateMany).not.toHaveBeenCalled();
  });

  it('preserves a snapshot locked between calculation and update', async () => {
    const prisma = {
      dossier: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new ConfigurationService(
      prisma as unknown as PrismaService,
    );
    jest
      .spyOn(service, 'calculateDossierPricing')
      .mockResolvedValueOnce({
        available: true,
        locked: false,
        cifPrice: 100,
        ddpPrice: 200,
        currency: 'DZD',
        missing: [],
      })
      .mockResolvedValueOnce({
        available: true,
        locked: true,
        cifPrice: 150,
        ddpPrice: undefined,
        currency: 'DZD',
        missing: [],
      });
    const result = await service.refreshDossierPricing('dossier', 'org');
    expect(prisma.dossier.updateMany).toHaveBeenCalledWith({
      where: { id: 'dossier', organizationId: 'org', priceLockedAt: null },
      data: {
        cifPrice: new Prisma.Decimal(100),
        ddpPrice: new Prisma.Decimal(200),
        priceCurrency: 'DZD',
      },
    });
    expect(result).toMatchObject({
      locked: true,
      cifPrice: 150,
      ddpPrice: undefined,
    });
  });
});
