import { BadRequestException, ConflictException } from '@nestjs/common';
import { OffersService } from './offers.service';

describe('OffersService', () => {
  let prisma: any;
  let service: OffersService;

  beforeEach(() => {
    prisma = {
      client: { findFirst: jest.fn() },
      chinaOffer: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(),
        update: jest.fn(),
      },
      partner: { findFirst: jest.fn() },
      commerceSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      offerReservation: {
        create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(),
      },
      warehouseLocation: { findFirst: jest.fn() },
      purchase: { findUnique: jest.fn(), create: jest.fn() },
      vehicle: { create: jest.fn() },
      dossierVehicle: { create: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
    };
    service = new OffersService(prisma);
  });

  it('rejects an invalid validity interval', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    await expect(service.create({
      supplierId: '00000000-0000-4000-8000-000000000001', brand: 'Geely', model: 'Coolray',
      condition: 'new', specification: {}, cifPrice: 10, ddpPrice: 12, currency: 'USD',
      validFrom: '2026-08-25T00:00:00.000Z', validUntil: '2026-08-24T00:00:00.000Z', availableQuantity: 1,
    }, 'org-1')).rejects.toThrow(BadRequestException);
  });

  it('reserves quantity atomically without creating a vehicle', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
    prisma.$queryRaw.mockResolvedValue([{ id: 'offer-1' }]);
    prisma.offerReservation.create.mockResolvedValue({ id: 'reservation-1', quantity: 1, status: 'active' });
    const result = await service.reserve('offer-1', { clientId: 'client-1', quantity: 1 }, 'user-1', 'org-1');
    expect(result.id).toBe('reservation-1');
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('rejects reservation when the atomic quantity update cannot claim stock', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.reserve('offer-1', { clientId: 'client-1', quantity: 2 }, 'user-1', 'org-1')).rejects.toThrow(ConflictException);
    expect(prisma.offerReservation.create).not.toHaveBeenCalled();
  });

  it('releases an active reservation and restores reserved quantity exactly once', async () => {
    prisma.offerReservation.findFirst.mockResolvedValue({ id: 'reservation-1', offerId: 'offer-1', quantity: 1, status: 'active' });
    prisma.offerReservation.update.mockResolvedValue({ id: 'reservation-1', status: 'released' });
    const result = await service.release('reservation-1', 'dossierCancelled', 'org-1');
    expect(result.status).toBe('released');
    expect(prisma.chinaOffer.update).toHaveBeenCalledWith({ where: { id: 'offer-1' }, data: { reservedQuantity: { decrement: 1 } } });
  });
});
