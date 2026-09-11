import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsService } from './shipments.service';

describe('ShipmentsService', () => {
  let service: ShipmentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    partner: {
      findFirst: jest.fn(),
    },
    shipment: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShipmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ShipmentsService>(ShipmentsService);
  });

  it('should transition shipment status and record audit history', async () => {
    mockPrisma.shipment.findFirst.mockResolvedValue({
      id: 'shp-1',
      organizationId: 'org-1',
      status: 'pending',
      actualDepartureDate: null,
      actualArrivalDate: null,
    });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: jest.fn(),
        shipmentStatusHistory: {
          create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
        },
        shipment: {
          findFirst: mockPrisma.shipment.findFirst,
          update: jest.fn().mockResolvedValue({
            id: 'shp-1',
            status: 'booked',
            actualDepartureDate: null,
          }),
        },
      };
      return callback(tx);
    });

    const result = await service.transition('shp-1', 'org-1', 'user-1', {
      status: 'booked',
      comment: 'Shipment booked',
    });

    expect(result.status).toBe('booked');
  });
});


describe('Maritime shipment supplier', () => {
  const supplier = { id: '11111111-1111-4111-8111-111111111111', organizationId: 'org', type: 'supplier', supplierType: 'LOGISTICS_PROVIDER', status: 'active', name: 'Logistics supplier' };
  function setup(partner = supplier) {
    let saved: any;
    const tx: any = {
      partner: { findFirst: jest.fn(async ({ where }) => Object.entries(where).every(([key, value]) => partner[key] === value) ? partner : null) },
      commerceSequence: { upsert: jest.fn().mockResolvedValue({ value: 1 }) },
      shipment: {
        create: jest.fn(({ data }) => { saved = { id: 'shipment', ...data, vehicles: [], carrierPartner: partner }; return saved; }),
        findUnique: jest.fn(() => saved), findFirst: jest.fn(() => saved),
        update: jest.fn(({ data }) => { saved = { ...saved, ...data }; return saved; }),
        findUniqueOrThrow: jest.fn(() => saved),
      },
      $queryRaw: jest.fn(),
    };
    tx.$transaction = jest.fn((callback) => callback(tx));
    return { tx, service: new ShipmentsService(tx) };
  }
  it('stores and rereads the existing carrierPartner relation', async () => {
    const { service, tx } = setup();
    await service.create('org', 'actor', { carrierPartnerId: supplier.id, containerType: 'THREE_VEHICLES' });
    expect(tx.shipment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ carrierPartnerId: supplier.id }) }));
    const reopened = await service.findOne('shipment', 'org');
    expect(reopened.carrierPartner?.id).toBe(supplier.id);
    expect(tx.shipment.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ include: expect.objectContaining({ carrierPartner: true }) }));
  });
  it.each(['VEHICLE', 'TRADING_COMPANY', 'OTHER', 'FORWARDER'])('rejects supplier type %s', async (supplierType) => {
    const { service, tx } = setup({ ...supplier, supplierType });
    await expect(service.create('org', 'actor', { carrierPartnerId: supplier.id, containerType: 'THREE_VEHICLES' })).rejects.toThrow('logistics supplier');
    expect(tx.shipment.create).not.toHaveBeenCalled();
  });
  it('rejects a supplier from another organization', async () => {
    const { service } = setup({ ...supplier, organizationId: 'other-org' });
    await expect(service.create('org', 'actor', { carrierPartnerId: supplier.id })).rejects.toThrow('logistics supplier');
  });
  it('rejects an inactive logistics supplier', async () => {
    const { service } = setup({ ...supplier, status: 'inactive' });
    await expect(service.create('org', 'actor', { carrierPartnerId: supplier.id })).rejects.toThrow('logistics supplier');
  });
  it('validates a replacement supplier on update', async () => {
    const { service, tx } = setup();
    await service.create('org', 'actor', { carrierPartnerId: supplier.id, containerType: 'THREE_VEHICLES' });
    tx.partner.findFirst.mockResolvedValue(null);
    await expect(service.update('shipment', 'org', { carrierPartnerId: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow('logistics supplier');
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });
});
