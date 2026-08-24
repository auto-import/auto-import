import { AgentPresenceStatus } from '@prisma/client';
import { AgentPresenceService } from './agent-presence.service';

describe('AgentPresenceService', () => {
  it('marks stale heartbeats offline before returning the board', async () => {
    const prisma = {
      agentPresence: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new AgentPresenceService(prisma as never);
    await service.list('org-1');
    expect(prisma.agentPresence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
        data: {
          status: AgentPresenceStatus.OFFLINE,
          currentCallId: null,
        },
      }),
    );
  });
});
