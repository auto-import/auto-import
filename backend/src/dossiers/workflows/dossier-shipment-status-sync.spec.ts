import { ConflictException } from '@nestjs/common';
import { DossierType } from '@auto-import/contracts';
import { ShipmentsService } from '../../shipments/shipments.service';
import { DossierWorkflowService } from './dossier-workflow.service';
import { DossierStatusPropagationService } from './dossier-status-propagation.service';
import {
  advancesShipment,
  getTargetShipmentStatus,
} from './dossier-shipment-status.map';

describe('Dossier maritime propagation', () => {
  it.each([
    ['shipmentBooking', 'booked'],
    ['booking', 'booked'],
    ['loading', 'loading'],
    ['billOfLadingIssued', 'inTransit'],
    ['containerBillOfLading', 'inTransit'],
    ['inTransit', 'inTransit'],
    ['arrivedAtPort', 'arrived'],
    ['arrived', 'arrived'],
    ['customsClearance', 'arrived'],
    ['customsReleased', 'arrived'],
    ['portExit', 'arrived'],
    ['localTransport', 'arrived'],
    ['deliveredToClient', 'arrived'],
    ['documentsDelivered', 'arrived'],
    ['closed', 'arrived'],
    ['serviceCompleted', 'arrived'],
    ['arrivee_port', 'arrived'],
    ['bl_emis', 'inTransit'],
    ['cancelled', null],
    ['vehicleBooking', null],
    ['unknown', null],
  ])('maps %s to %s', (status, expected) => {
    expect(getTargetShipmentStatus(status)).toBe(expected);
  });

  it('never regresses, reopens or overwrites an unknown legacy shipment status', () => {
    expect(advancesShipment('arrived', 'booked')).toBe(false);
    expect(advancesShipment('inTransit', 'loading')).toBe(false);
    expect(advancesShipment('cancelled', 'arrived')).toBe(false);
    expect(advancesShipment('delivered', 'arrived')).toBe(false);
  });

  function setup(status = 'loading') {
    const shipment: any = {
      id: 'shipment',
      organizationId: 'org',
      status,
      actualDepartureDate: null,
      actualArrivalDate: null,
      vehicles: [],
    };
    const tx: any = {
      $queryRaw: jest.fn(),
      shipment: {
        findMany: jest.fn().mockResolvedValue([{ id: 'shipment' }]),
        findFirst: jest.fn(async () => shipment),
        update: jest.fn(async ({ data }) => Object.assign(shipment, data)),
      },
      shipmentStatusHistory: { create: jest.fn() },
      vehicle: { updateMany: jest.fn() },
    };
    const service = new ShipmentsService({} as never);
    const input = {
      organizationId: 'org',
      dossierId: 'd1',
      dossierReference: 'CA-1',
      fromStatus: 'loading',
      toStatus: 'inTransit',
      userId: 'actor',
    };
    return { tx, service, shipment, input };
  }

  it('shares the caller transaction, scopes both relationship paths and records source and actor', async () => {
    const { tx, service, shipment, input } = setup();
    await service.syncFromDossier(tx, input);
    expect(shipment.status).toBe('inTransit');
    expect(shipment.actualDepartureDate).toBeInstanceOf(Date);
    expect(tx.shipment.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: 'org',
        OR: [
          {
            vehicles: {
              some: {
                vehicle: {
                  organizationId: 'org',
                  dossierVehicles: { some: { dossierId: 'd1' } },
                },
              },
            },
          },
          {
            customsFiles: { some: { organizationId: 'org', dossierId: 'd1' } },
          },
        ],
      },
      orderBy: { id: 'asc' },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.shipmentStatusHistory.create).toHaveBeenCalledWith({
      data: {
        shipmentId: 'shipment',
        fromStatus: 'loading',
        toStatus: 'inTransit',
        changedBy: 'actor',
        comment: 'Dossier CA-1 (d1): loading -> inTransit',
      },
    });
  });

  it('does not regress a shared voyage when another dossier is behind', async () => {
    const { tx, service, shipment, input } = setup();
    await service.syncFromDossier(tx, input);
    const departure = shipment.actualDepartureDate;
    await service.syncFromDossier(tx, {
      ...input,
      dossierId: 'd2',
      toStatus: 'loading',
    });
    await service.syncFromDossier(tx, input);
    expect(shipment.status).toBe('inTransit');
    expect(shipment.actualDepartureDate).toBe(departure);
    expect(tx.shipmentStatusHistory.create).toHaveBeenCalledTimes(1);
  });

  it('reuses arrival automation and preserves the recorded departure date', async () => {
    const { tx, service, shipment, input } = setup('inTransit');
    const departure = new Date('2026-09-01T12:00:00Z');
    shipment.actualDepartureDate = departure;
    await service.syncFromDossier(tx, { ...input, toStatus: 'arrivedAtPort' });
    expect(shipment.status).toBe('arrived');
    expect(shipment.actualArrivalDate).toBeInstanceOf(Date);
    expect(shipment.actualDepartureDate).toBe(departure);
    // Arrival re-reads relations through the existing customs creation method.
    expect(tx.shipment.findFirst).toHaveBeenCalledTimes(2);
  });

  it('rechecks membership after locking and skips detached shipments', async () => {
    const { tx, service, input } = setup();
    tx.shipment.findFirst.mockResolvedValue(null);
    await service.syncFromDossier(tx, input);
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });

  it('does not cancel the shared voyage when a dossier is cancelled', async () => {
    const { tx, service, input } = setup();
    await service.syncFromDossier(tx, { ...input, toStatus: 'cancelled' });
    expect(tx.shipment.findMany).not.toHaveBeenCalled();
  });

  it('passes one transaction through ordered projections and propagates failures', async () => {
    const vehicles = { syncForTransition: jest.fn().mockResolvedValue([]) };
    const commerce = {
      syncForTransition: jest.fn().mockResolvedValue(undefined),
    };
    const shipments = {
      syncFromDossier: jest.fn().mockRejectedValue(new Error('arrival failed')),
    };
    const customs = { syncFromDossier: jest.fn() };
    const service = new DossierStatusPropagationService(
      vehicles as never,
      shipments as never,
      commerce as never,
      customs as never,
    );
    const tx = {} as never;
    const input = { ...setup().input, vehicles: [] };
    await expect(service.syncForTransition(tx, input)).rejects.toThrow(
      'arrival failed',
    );
    expect(vehicles.syncForTransition).toHaveBeenCalledWith(tx, input);
    expect(commerce.syncForTransition).toHaveBeenCalledWith(tx, input);
    expect(shipments.syncFromDossier).toHaveBeenCalledWith(tx, input);
    expect(customs.syncFromDossier).not.toHaveBeenCalled();
  });

  it('rejects a backward dossier transition and a backward manual shipment transition', async () => {
    const workflow = new DossierWorkflowService();
    expect(() =>
      workflow.validateTransition(
        DossierType.VEHICLE_SALE_DDP,
        'arrivedAtPort',
        'inTransit',
      ),
    ).toThrow(ConflictException);
    const { tx } = setup('arrived');
    const service = new ShipmentsService({
      $transaction: (cb) => cb(tx),
    } as never);
    await expect(
      service.transition('shipment', 'org', 'actor', { status: 'inTransit' }),
    ).rejects.toThrow(ConflictException);
    expect(tx.shipment.update).not.toHaveBeenCalled();
  });
});
