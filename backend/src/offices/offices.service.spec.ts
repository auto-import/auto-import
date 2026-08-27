import { ConflictException, NotFoundException } from '@nestjs/common';
import { OfficesService } from './offices.service';
import type { PrismaService } from '../prisma/prisma.service';

type MockFn = jest.Mock<Promise<unknown>, unknown[]>;
const mockAsync = (): MockFn => jest.fn<Promise<unknown>, unknown[]>();
interface PrismaMock {
  office: {
    create: MockFn;
    findMany: MockFn;
    count: MockFn;
    findFirst: MockFn;
    update: MockFn;
    delete: MockFn;
  };
  user: { count: MockFn };
}

describe('OfficesService', () => {
  let prisma: PrismaMock;
  let service: OfficesService;

  beforeEach(() => {
    prisma = {
      office: {
        create: mockAsync(),
        findMany: mockAsync(),
        count: mockAsync(),
        findFirst: mockAsync(),
        update: mockAsync(),
        delete: mockAsync(),
      },
      user: { count: mockAsync() },
    };
    service = new OfficesService(prisma as unknown as PrismaService);
  });

  it('binds a new office to the authenticated organization', async () => {
    prisma.office.create.mockResolvedValue({
      id: 'office-a',
      name: 'Alger',
      organizationId: 'org-a',
    });

    await service.create({ name: ' Alger ' }, 'org-a');

    expect(prisma.office.create).toHaveBeenCalledWith({
      data: { name: 'Alger', organizationId: 'org-a' },
    });
  });

  it('uses tenant, search, and status filters for the list', async () => {
    prisma.office.findMany.mockResolvedValue([]);
    prisma.office.count.mockResolvedValue(0);

    await service.findAll('org-a', {
      search: 'alg',
      status: 'active',
      page: 2,
      limit: 10,
    });

    const query = prisma.office.findMany.mock.calls[0][0] as {
      where: { organizationId: string; status: string; OR: unknown[] };
      skip: number;
      take: number;
    };
    expect(query.where.organizationId).toBe('org-a');
    expect(query.where.status).toBe('active');
    expect(query.where.OR).toHaveLength(3);
    expect(query.skip).toBe(10);
    expect(query.take).toBe(10);
  });

  it('hides an office from another tenant', async () => {
    prisma.office.findFirst.mockResolvedValue(null);

    await expect(service.findOne('office-b', 'org-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.office.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'office-b', organizationId: 'org-a' },
      }),
    );
  });

  it('refuses to delete an office assigned to users', async () => {
    prisma.office.findFirst.mockResolvedValue({ id: 'office-a' });
    prisma.user.count.mockResolvedValue(1);

    await expect(service.remove('office-a', 'org-a')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.office.delete).not.toHaveBeenCalled();
  });
});
