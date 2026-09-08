/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';

describe('ConfigurationService managed references', () => {
  let prisma: any;
  let service: ConfigurationService;

  beforeEach(() => {
    prisma = {
      vehicleLookupValue: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      crmReferenceValue: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(prisma),
      ),
    };
    service = new ConfigurationService(prisma);
  });

  it('requires a model to belong to an active brand', async () => {
    prisma.vehicleLookupValue.findFirst.mockResolvedValue({
      id: 'not-a-brand',
      kind: 'MODEL',
      active: true,
    });
    await expect(
      service.createLookup('org-1', 'user-1', {
        kind: 'MODEL',
        value: 'Corolla',
        parentId: 'not-a-brand',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a version only under the selected model', async () => {
    prisma.vehicleLookupValue.findFirst
      .mockResolvedValueOnce({
        id: 'model-corolla',
        kind: 'MODEL',
        active: true,
      })
      .mockResolvedValueOnce(null);
    prisma.vehicleLookupValue.create.mockResolvedValue({
      id: 'version-gr',
      kind: 'VERSION',
      value: 'GR Sport',
      parentId: 'model-corolla',
      active: true,
    });

    await expect(
      service.createLookup('org-1', 'user-1', {
        kind: 'VERSION',
        value: ' GR  Sport ',
        parentId: 'model-corolla',
      }),
    ).resolves.toMatchObject({ id: 'version-gr' });
    expect(prisma.vehicleLookupValue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        parentId: 'model-corolla',
        value: 'GR Sport',
        normalizedValue: 'gr sport',
      }),
    });
  });

  it('normalizes a managed currency and prevents duplicates', async () => {
    prisma.crmReferenceValue.findMany.mockResolvedValue([
      {
        id: 'currency-eur',
        active: true,
        code: 'SUPPLIER_CURRENCY_EUR',
        labelFr: 'EUR',
      },
    ]);
    await expect(
      service.createSupplierReference('org-1', 'user-1', {
        kind: 'CURRENCY',
        value: ' eur ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.crmReferenceValue.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        kind: 'SUPPLIER_CURRENCY',
      },
    });
  });

  it('persists and audits a new supplier country', async () => {
    prisma.crmReferenceValue.findMany.mockResolvedValue([]);
    prisma.crmReferenceValue.create.mockResolvedValue({
      id: 'country-turkiye',
      kind: 'SUPPLIER_COUNTRY',
      code: 'SUPPLIER_COUNTRY_TURKIYE',
      labelFr: 'Türkiye',
      active: true,
    });
    await expect(
      service.createSupplierReference('org-1', 'user-1', {
        kind: 'COUNTRY',
        value: '  Türkiye  ',
      }),
    ).resolves.toMatchObject({ id: 'country-turkiye' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'SUPPLIER_REFERENCE_CREATED',
        organizationId: 'org-1',
      }),
    });
  });
});
