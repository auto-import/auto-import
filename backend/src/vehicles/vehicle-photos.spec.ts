import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageProvider } from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';
import { VehiclesService } from './vehicles.service';

const file = (name: string, byte: number): UploadedBufferFile => ({
  originalname: name,
  mimetype: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, byte]),
});

describe('VehiclesService ordered private photos', () => {
  it('rejects fewer or more than exactly three uploads before database writes', async () => {
    const service = new VehiclesService(
      {} as PrismaService,
      {} as StorageProvider,
    );
    await expect(
      service.createWithPhotos(
        {
          brand: 'BYD',
          model: 'Seal',
          acquisitionType: 'stock',
          status: 'prePurchase',
        } as never,
        'org-1',
        'user-1',
        [file('one.png', 1)] as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-pre-purchase creation without a VIN before staging files', async () => {
    const storage = { saveBuffer: jest.fn() };
    const service = new VehiclesService(
      {} as PrismaService,
      storage as unknown as StorageProvider,
    );
    await expect(
      service.createWithPhotos(
        {
          brand: 'BYD',
          model: 'Seal',
          acquisitionType: 'stock',
          status: 'available',
        } as never,
        'org-1',
        'user-1',
        [file('one.png', 1), file('two.png', 2), file('three.png', 3)],
      ),
    ).rejects.toThrow('VIN is required outside the pre-purchase state');
    expect(storage.saveBuffer).not.toHaveBeenCalled();
  });

  it('rejects duplicate bytes and compensates every staged file', async () => {
    const storage = {
      detectMimeType: jest.fn().mockReturnValue('image/png'),
      saveBuffer: jest
        .fn()
        .mockImplementation((_org: string, _cat: string, name: string) =>
          Promise.resolve({
            storageKey: name,
            originalName: name,
            mimeType: 'image/png',
            size: 5n,
            checksum: 'same',
            absolutePath: name,
          }),
        ),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new VehiclesService(
      {} as PrismaService,
      storage as unknown as StorageProvider,
    );
    await expect(
      service.createWithPhotos(
        {
          brand: 'BYD',
          model: 'Seal',
          acquisitionType: 'stock',
          status: 'prePurchase',
        } as never,
        'org-1',
        'user-1',
        [file('one.png', 1), file('two.png', 2), file('three.png', 3)] as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.delete).toHaveBeenCalledTimes(3);
  });

  it('paginates eligible vehicles beyond page one and returns authorized exclusion reasons', async () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      id: `vehicle-${index + 1}`,
      organizationId: 'org-a',
      status: 'available',
      acquisitionType: 'stock',
      archivedAt: null,
      dossierVehicles: [],
      specs: null,
      photos: [],
    }));
    const vehicle = {
      findMany: jest
        .fn()
        .mockImplementation(({ skip, take }: { skip: number; take: number }) =>
          Promise.resolve(rows.slice(skip, skip + take)),
        ),
      count: jest.fn().mockResolvedValue(rows.length),
    };
    const service = new VehiclesService(
      { vehicle } as unknown as PrismaService,
      {} as StorageProvider,
    );

    const page = await service.eligibleForDossier('org-a', {
      type: 'VEHICLE_SALE_DDP',
      page: 2,
      limit: 5,
    } as never);

    expect(page.items.map(({ id }) => id)).toEqual(['vehicle-6', 'vehicle-7']);
    expect(page.pagination).toEqual(
      expect.objectContaining({
        totalItems: 7,
        page: 2,
        hasPreviousPage: true,
      }),
    );
    expect(vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );

    vehicle.findMany.mockResolvedValueOnce([
      {
        ...rows[0],
        status: 'reserved',
      },
    ]);
    vehicle.count.mockResolvedValueOnce(1);
    const diagnostics = await service.eligibleForDossier('org-a', {
      type: 'VEHICLE_SALE_DDP',
      page: 1,
      limit: 5,
      includeExcluded: true,
    } as never);
    expect(diagnostics.items[0].eligibility).toEqual({
      eligible: false,
      reason: 'RESERVED',
    });
  });
});
