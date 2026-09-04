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
  it.each([1, 2, 3])('accepts a gallery with %i photo(s)', async (count) => {
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
            checksum: `checksum-${name}`,
            absolutePath: name,
          }),
        ),
      delete: jest.fn(),
    };
    const service = new OffersService(
      {} as PrismaService,
      {} as never,
      storage as unknown as StorageProvider,
    );

    const result = await (
      service as unknown as {
        storePhotos: (
          organizationId: string,
          files: UploadedBufferFile[],
        ) => Promise<unknown[]>;
      }
    ).storePhotos(
      'org-a',
      Array.from({ length: count }, (_, index) =>
        photo(`photo-${index + 1}.png`, index + 1),
      ),
    );

    expect(result).toHaveLength(count);
    expect(storage.saveBuffer).toHaveBeenCalledTimes(count);
  });

  it('rejects an empty or oversized multipart gallery before database writes', async () => {
    const storage = { assertAllowedMime: jest.fn(), saveBuffer: jest.fn() };
    const service = new OffersService(
      {} as PrismaService,
      {} as never,
      storage as unknown as StorageProvider,
    );
    const storePhotos = (
      service as unknown as {
        storePhotos: (
          organizationId: string,
          files: UploadedBufferFile[],
        ) => Promise<unknown[]>;
      }
    ).storePhotos.bind(service);

    await expect(storePhotos('org-a', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      storePhotos('org-a', [
        photo('one.png', 1),
        photo('two.png', 2),
        photo('three.png', 3),
        photo('four.png', 4),
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
      {} as never,
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

  it('rejects an invalid image type before saving it', async () => {
    const storage = {
      assertAllowedMime: jest.fn(() => {
        throw new BadRequestException('Invalid image type');
      }),
      saveBuffer: jest.fn(),
      delete: jest.fn(),
    };
    const service = new OffersService(
      {} as PrismaService,
      {} as never,
      storage as unknown as StorageProvider,
    );

    await expect(
      (
        service as unknown as {
          storePhotos: (
            organizationId: string,
            files: UploadedBufferFile[],
          ) => Promise<unknown[]>;
        }
      ).storePhotos('org-a', [photo('fake.png', 1)]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.saveBuffer).not.toHaveBeenCalled();
  });
});
