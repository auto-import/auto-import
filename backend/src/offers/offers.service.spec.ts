import { BadRequestException, ConflictException } from '@nestjs/common';
import { OffersService } from './offers.service';

describe('OffersService', () => {
  let prisma: any;
  let service: OffersService;
  let costs: { recordPurchaseCommitment: jest.Mock };

  beforeEach(() => {
    prisma = {
      client: { findFirst: jest.fn() },
      chinaOffer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      chinaOfferRevision: {
        aggregate: jest.fn().mockResolvedValue({ _max: { revisionNumber: 0 } }),
        create: jest.fn(),
      },
      chinaOfferVehicle: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      chinaOfferStatusHistory: { create: jest.fn() },
      supplierDossierLink: { upsert: jest.fn() },
      dossier: { findFirst: jest.fn() },
      partner: { findFirst: jest.fn() },
      commerceSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      offerReservation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      warehouseLocation: { findFirst: jest.fn() },
      purchase: { findUnique: jest.fn(), create: jest.fn() },
      vehicle: { create: jest.fn() },
      vehiclePhoto: { create: jest.fn() },
      auditLog: { create: jest.fn() },
      dossierVehicle: { create: jest.fn() },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };
    costs = { recordPurchaseCommitment: jest.fn() };
    service = new OffersService(prisma, costs as never);
  });

  it('rejects an invalid validity interval', async () => {
    prisma.partner.findFirst.mockResolvedValue({ id: 'supplier-1' });
    await expect(
      service.create(
        {
          supplierId: '00000000-0000-4000-8000-000000000001',
          brand: 'Geely',
          model: 'Coolray',
          condition: 'new',
          specification: {},
          supplierPrice: 10,
          currency: 'USD',
          validFrom: '2026-08-25T00:00:00.000Z',
          validUntil: '2026-08-24T00:00:00.000Z',
          availableQuantity: 1,
        },
        'org-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reserves quantity atomically without creating a vehicle', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
    prisma.$queryRaw.mockResolvedValue([
      { id: 'offer-1', currentRevisionId: 'revision-1' },
    ]);
    prisma.offerReservation.create.mockResolvedValue({
      id: 'reservation-1',
      quantity: 1,
      status: 'active',
    });
    const result = await service.reserve(
      'offer-1',
      { clientId: 'client-1', quantity: 1 },
      'user-1',
      'org-1',
    );
    expect(result.id).toBe('reservation-1');
    expect(prisma.offerReservation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceOfferRevisionId: 'revision-1' }),
      }),
    );
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('rejects reservation when the atomic quantity update cannot claim stock', async () => {
    prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(
      service.reserve(
        'offer-1',
        { clientId: 'client-1', quantity: 2 },
        'user-1',
        'org-1',
      ),
    ).rejects.toThrow(ConflictException);
    expect(prisma.offerReservation.create).not.toHaveBeenCalled();
  });

  it('releases an active reservation and restores reserved quantity exactly once', async () => {
    prisma.offerReservation.findFirst.mockResolvedValue({
      id: 'reservation-1',
      offerId: 'offer-1',
      quantity: 1,
      status: 'active',
    });
    prisma.offerReservation.update.mockResolvedValue({
      id: 'reservation-1',
      status: 'released',
    });
    const result = await service.release(
      'reservation-1',
      'dossierCancelled',
      'org-1',
    );
    expect(result.status).toBe('released');
    expect(prisma.chinaOffer.update).toHaveBeenCalledWith({
      where: { id: 'offer-1' },
      data: { reservedQuantity: { decrement: 1 } },
    });
  });

  it('records a controlled supplier-offer workflow transition', async () => {
    prisma.chinaOffer.findFirst.mockResolvedValue({
      id: 'offer-1',
      organizationId: 'org-1',
      offerStatus: 'RECEIVED',
      archivedAt: null,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2027-01-01'),
      availableQuantity: 1,
      reservedQuantity: 0,
    });
    prisma.chinaOffer.update.mockResolvedValue({
      id: 'offer-1',
      offerStatus: 'UNDER_VERIFICATION',
      archivedAt: null,
      validFrom: new Date('2026-01-01'),
      validUntil: new Date('2027-01-01'),
      availableQuantity: 1,
      reservedQuantity: 0,
    });

    const result = await service.transition(
      'offer-1',
      { status: 'UNDER_VERIFICATION', reason: 'Documents checked' },
      'user-1',
      'org-1',
    );

    expect(result.status).toBe('UNDER_VERIFICATION');
    expect(prisma.chinaOfferStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'RECEIVED',
        toStatus: 'UNDER_VERIFICATION',
        actorId: 'user-1',
      }),
    });
  });

  it('rejects an invalid offer workflow transition', async () => {
    prisma.chinaOffer.findFirst.mockResolvedValue({
      id: 'offer-1',
      organizationId: 'org-1',
      offerStatus: 'RECEIVED',
    });
    await expect(
      service.transition('offer-1', { status: 'RESERVED' }, 'user-1', 'org-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('posts one purchase expense in the same transaction as a bought offer line', async () => {
    const offer = {
      id: 'offer-1',
      organizationId: 'org-1',
      supplierId: 'supplier-1',
      supplier: { id: 'supplier-1', name: 'China Motors', country: 'CN' },
      currentRevisionId: 'revision-1',
      offerStatus: 'VALIDATED',
      status: 'available',
      validUntil: new Date(Date.now() + 86_400_000),
      availableQuantity: 1,
      reservedQuantity: 0,
      photos: [],
    };
    const line = {
      id: 'line-1',
      offerId: 'offer-1',
      brand: 'Geely',
      model: 'Coolray',
      version: null,
      year: 2026,
      mileage: 0,
      condition: 'new',
      specification: {},
      supplierPrice: { toNumber: () => 12000 },
      currency: 'USD',
      vin: null,
      quantity: 1,
      purchasedQuantity: 0,
      reservedQuantity: 0,
      status: 'VALIDATED',
      offer,
    };
    prisma.chinaOfferVehicle.findFirst
      .mockResolvedValueOnce(line)
      .mockResolvedValueOnce({
        ...line,
        purchasedQuantity: 1,
        status: 'PURCHASED',
      });
    prisma.vehicle.create.mockResolvedValue({ id: 'vehicle-1', specs: {} });
    prisma.purchase.create.mockResolvedValue({
      id: 'purchase-1',
      purchaseNumber: 'PUR-2026-00001',
      purchasePrice: 12000,
      currency: 'USD',
      supplierId: 'supplier-1',
      dossierId: null,
      purchaseDate: new Date(),
    });

    await service.purchaseOfferVehicle(
      'offer-1',
      'line-1',
      {},
      'user-1',
      'org-1',
    );

    expect(costs.recordPurchaseCommitment).toHaveBeenCalledTimes(1);
    expect(costs.recordPurchaseCommitment).toHaveBeenCalledWith(
      prisma,
      'org-1',
      'user-1',
      expect.objectContaining({ id: 'purchase-1', purchasePrice: 12000 }),
    );
    expect(prisma.chinaOffer.update).toHaveBeenCalledWith({
      where: { id: 'offer-1' },
      data: expect.objectContaining({ offerStatus: 'PURCHASED' }),
    });

    await expect(
      service.purchaseOfferVehicle('offer-1', 'line-1', {}, 'user-1', 'org-1'),
    ).rejects.toThrow(ConflictException);
    expect(costs.recordPurchaseCommitment).toHaveBeenCalledTimes(1);
  });

  it('calculates offer KPIs from mutually exclusive effective statuses', async () => {
    const now = Date.now();
    const active = {
      archivedAt: null,
      validFrom: new Date(now - 86_400_000),
      validUntil: new Date(now + 86_400_000),
      availableQuantity: 1,
      reservedQuantity: 0,
    };
    prisma.chinaOffer.findMany.mockResolvedValue([
      { ...active, id: 'available', offerStatus: 'VALIDATED' },
      { ...active, id: 'reserved', offerStatus: 'RESERVED' },
      {
        ...active,
        id: 'purchased',
        offerStatus: 'PURCHASED',
        validUntil: new Date(now - 1),
      },
      {
        ...active,
        id: 'lost',
        offerStatus: 'LOST_DEAL',
        validUntil: new Date(now - 1),
      },
      {
        ...active,
        id: 'expired',
        offerStatus: 'VALIDATED',
        validUntil: new Date(now - 1),
      },
    ]);

    await expect(service.statistics('org-1')).resolves.toEqual(
      expect.objectContaining({
        total: 5,
        byStatus: expect.objectContaining({
          available: 1,
          reserved: 1,
          purchased: 1,
          lost: 1,
          expired: 1,
        }),
      }),
    );
    expect(prisma.chinaOffer.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', archivedAt: null },
    });
  });
});
