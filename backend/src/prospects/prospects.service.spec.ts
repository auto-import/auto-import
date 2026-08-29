import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactResolutionService } from '../crm/contact-resolution.service';
import { CrmReferenceService } from '../crm/crm-reference.service';
import { ProspectsService } from './prospects.service';

function concurrencyError(code: 'P2002' | 'P2010' | 'P2034') {
  return new Prisma.PrismaClientKnownRequestError('concurrent winner', {
    code,
    clientVersion: 'test',
    ...(code === 'P2010'
      ? { meta: { code: '40001', message: 'could not serialize access' } }
      : {}),
  });
}

describe('ProspectsService concurrency guarantees', () => {
  const createDto = {
    firstName: 'Duplicate',
    lastName: 'Attempt',
    phone: '0550000000',
    entryChannelId: '0d3dd271-3100-4f88-90b0-925dd72a8531',
    marketingSourceId: 'cc2f21f3-29bf-48aa-8d21-2b8bf15e87e7',
  };

  it('returns the concurrent winning lead instead of creating a duplicate', async () => {
    const contacts = {
      normalizePhoneForCountry: jest.fn().mockResolvedValue('+213550000000'),
      matchNormalizedPhoneInTransaction: jest
        .fn()
        .mockResolvedValueOnce({
          normalizedValue: '+213550000000',
          match: null,
        })
        .mockResolvedValueOnce({
          normalizedValue: '+213550000000',
          match: {
            matchState: 'MATCHED',
            prospectId: 'lead-winner',
            clientId: null,
            candidateIds: { prospectIds: ['lead-winner'], clientIds: [] },
          },
        }),
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((callback: (tx: object) => Promise<unknown>) =>
          callback({}),
        )
        .mockRejectedValueOnce(concurrencyError('P2002'))
        .mockImplementationOnce((callback: (tx: object) => Promise<unknown>) =>
          callback({}),
        ),
      crmNote: { create: jest.fn().mockResolvedValue({}) },
      prospect: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lead-winner',
          firstName: 'Concurrent',
          lastName: 'Winner',
          activities: [],
          contactPoints: [],
          tasks: [],
          conversions: [],
        }),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      contacts as unknown as ContactResolutionService,
      {} as CrmReferenceService,
    );
    await expect(
      service.create(createDto, 'user-a', 'org-a'),
    ).resolves.toMatchObject({
      id: 'lead-winner',
      created: false,
      matchState: 'MATCHED',
    });
  });

  it('keeps an ambiguous interaction unowned and returns reconciliation details', async () => {
    const match = {
      matchState: 'AMBIGUOUS' as const,
      prospectId: null,
      clientId: null,
      candidateIds: {
        prospectIds: ['lead-a', 'lead-b'],
        clientIds: ['client-a'],
      },
    };
    const contacts = {
      normalizePhoneForCountry: jest.fn().mockResolvedValue('+213550000000'),
      matchNormalizedPhoneInTransaction: jest
        .fn()
        .mockResolvedValue({ normalizedValue: '+213550000000', match }),
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: object) => Promise<unknown>) =>
        callback({}),
      ),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      contacts as unknown as ContactResolutionService,
      {} as CrmReferenceService,
    );
    await expect(
      service.create(createDto, 'user-a', 'org-a'),
    ).resolves.toMatchObject({
      created: false,
      matchState: 'AMBIGUOUS',
      candidateIds: match.candidateIds,
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('uses the client as primary when one lead and one client share the number', async () => {
    const contacts = {
      normalizePhoneForCountry: jest.fn().mockResolvedValue('+213550000000'),
      matchNormalizedPhoneInTransaction: jest.fn().mockResolvedValue({
        normalizedValue: '+213550000000',
        match: {
          matchState: 'MATCHED',
          prospectId: 'lead-a',
          clientId: 'client-a',
          candidateIds: { prospectIds: ['lead-a'], clientIds: ['client-a'] },
        },
      }),
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: object) => Promise<unknown>) =>
        callback({}),
      ),
      crmNote: { create: jest.fn().mockResolvedValue({}) },
      client: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'client-a',
          firstName: 'Known',
          lastName: 'Client',
        }),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      contacts as unknown as ContactResolutionService,
      {} as CrmReferenceService,
    );
    await expect(
      service.create(createDto, 'user-a', 'org-a'),
    ).resolves.toMatchObject({
      created: false,
      matchedRecordType: 'CLIENT',
      linkedLeadId: 'lead-a',
      matchedRecord: { id: 'client-a' },
    });
  });

  it('returns the unique conversion winner after a concurrent retry conflict', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(concurrencyError('P2010')),
      prospectConversion: {
        findFirst: jest.fn().mockResolvedValue({
          client: {
            id: 'client-winner',
            organizationId: 'org-a',
            firstName: 'Existing',
            lastName: 'Client',
          },
        }),
      },
    };
    const service = new ProspectsService(
      prisma as unknown as PrismaService,
      {} as ContactResolutionService,
      {} as CrmReferenceService,
    );
    await expect(
      service.convertToClient('lead-a', {}, 'user-a', 'org-a'),
    ).resolves.toMatchObject({
      id: 'client-winner',
      converted: false,
      idempotentReplay: true,
    });
  });
});
