import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageProvider } from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';
import { OffersService } from './offers.service';

const photo = (name: string, marker: number): UploadedBufferFile => ({
  originalname: name,
  mimetype: 'image/png',
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, marker]),
});

describe('OffersService ordered private photos', () => {
  it('rejects any offer gallery that is not exactly three files before database writes', async () => {
    const storage = { assertAllowedMime: jest.fn(), saveBuffer: jest.fn() };
    const service = new OffersService(
      {} as PrismaService,
      storage as unknown as StorageProvider,
    );

    await expect(
      service.createWithPhotos({} as never, 'org-a', 'user-a', [
        photo('one.png', 1),
        photo('two.png', 2),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveBuffer).not.toHaveBeenCalled();
  });

  it('rejects duplicate checksums and compensates every staged private file', async () => {
    const storage = {
      assertAllowedMime: jest.fn().mockReturnValue('image/png'),
      saveBuffer: jest
        .fn()
        .mockImplementation((_org: string, _category: string, name: string) =>
          Promise.resolve({
            storageKey: `private/${name}`,
            originalName: name,
            mimeType: 'image/png',
            size: 5n,
            checksum: 'same-checksum',
            absolutePath: name,
          }),
        ),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OffersService(
      {} as PrismaService,
      storage as unknown as StorageProvider,
    );

    await expect(
      service.createWithPhotos({} as never, 'org-a', 'user-a', [
        photo('one.png', 1),
        photo('two.png', 2),
        photo('three.png', 3),
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.delete).toHaveBeenCalledTimes(3);
  });
});
