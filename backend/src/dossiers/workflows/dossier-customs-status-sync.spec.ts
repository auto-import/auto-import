import { CustomsService } from '../../customs/customs.service';
import { getTargetCustomsStatus } from './dossier-customs-status.map';

describe('Dossier customs lifecycle projection', () => {
  it.each([
    ['customsClearance', 'CLEARANCE_IN_PROGRESS'],
    ['customsReleased', 'RELEASE'],
    ['portExit', 'PORT_EXIT'],
    ['closed', 'CLOSED'],
    ['inTransit', null],
  ])('maps %s to %s', (status, expected) => {
    expect(getTargetCustomsStatus(status)).toBe(expected);
  });

  function setup(v2Status = 'FILE_TRANSMITTED') {
    const file = {
      id: 'customs-1',
      reference: 'CUST-1',
      v2Status,
      status: 'open',
      responsibleUserId: 'actor-1',
      clearedAt: null,
      releasedAt: null,
      portExitAt: null,
      closedAt: null,
    };
    const tx: any = {
      dossier: {
        findFirst: jest.fn().mockResolvedValue({ type: 'VEHICLE_SALE_DDP' }),
      },
      customsFile: {
        findMany: jest.fn().mockResolvedValue([file]),
        update: jest.fn(async ({ data }) => ({ ...file, ...data })),
      },
      customsStatusHistory: { create: jest.fn() },
      task: { upsert: jest.fn() },
      notification: { createMany: jest.fn() },
    };
    const costs = { recordCustomsActual: jest.fn() };
    const service = new CustomsService({} as never, costs as never);
    return { tx, costs, service };
  }

  it('advances a ready customs file and writes history in the caller transaction', async () => {
    const { tx, service } = setup();
    await service.syncFromDossier(tx, {
      organizationId: 'org-1',
      dossierId: 'dossier-1',
      dossierReference: 'CA-1',
      fromStatus: 'arrivedAtPort',
      toStatus: 'customsClearance',
      userId: 'actor-1',
    });
    expect(tx.customsFile.update).toHaveBeenCalledWith({
      where: { id: 'customs-1' },
      data: expect.objectContaining({
        status: 'open',
        v2Status: 'CLEARANCE_IN_PROGRESS',
      }),
    });
    expect(tx.customsStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'FILE_TRANSMITTED',
        toStatus: 'CLEARANCE_IN_PROGRESS',
        changedBy: 'actor-1',
      }),
    });
  });

  it('blocks the dossier atomically while detailed customs work is incomplete', async () => {
    const { tx, service } = setup('ARRIVED_AT_PORT');
    await expect(
      service.syncFromDossier(tx, {
        organizationId: 'org-1',
        dossierId: 'dossier-1',
        dossierReference: 'CA-1',
        fromStatus: 'arrivedAtPort',
        toStatus: 'customsClearance',
        userId: 'actor-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMS_NOT_READY_FOR_DOSSIER_STAGE' },
    });
    expect(tx.customsFile.update).not.toHaveBeenCalled();
    expect(tx.customsStatusHistory.create).not.toHaveBeenCalled();
  });
});
