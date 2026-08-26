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
});
