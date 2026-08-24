import { CrmTimelineService } from './crm-timeline.service';

describe('CrmTimelineService', () => {
  it('uses stable occurredAt/id ordering and a non-overlapping cursor', async () => {
    const occurredAt = new Date('2026-08-24T10:00:00.000Z');
    const prisma = {
      prospect: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prospect-1' }),
      },
      prospectActivity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            type: 'NOTE',
            title: 'ActivitÃ©',
            description: null,
            activityDate: occurredAt,
          },
        ]),
      },
      callSession: { findMany: jest.fn().mockResolvedValue([]) },
      whatsappMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'z',
            direction: 'INBOUND',
            text: 'Message',
            occurredAt,
            status: 'RECEIVED',
            contentType: 'TEXT',
          },
        ]),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
      crmNote: { findMany: jest.fn().mockResolvedValue([]) },
      prospectStatusHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CrmTimelineService(prisma as never);
    const first = await service.getTimeline(
      'org-1',
      'prospect',
      'prospect-1',
      undefined,
      1,
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await service.getTimeline(
      'org-1',
      'prospect',
      'prospect-1',
      first.nextCursor!,
      1,
    );
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
  });
});
