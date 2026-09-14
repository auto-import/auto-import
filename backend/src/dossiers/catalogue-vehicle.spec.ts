import { ConflictException } from '@nestjs/common';
import { reserveCatalogueVehicle } from './catalogue-vehicle';

describe('Catalogue vehicle identity', () => {
  const source = {
    id: 'source-1',
    organizationId: 'org-1',
    offerId: 'offer-1',
    offer: { supplierId: 'supplier-1' },
    brand: 'Geely',
    model: 'Coolray',
    currency: 'CNY',
    specification: { color: 'ARGENTÉ' },
  } as never;
  function setup(existing: object | null = null) {
    const tx = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn().mockResolvedValue({ id: 'vehicle-1' }),
        update: jest.fn(),
      },
      dossierVehicle: { findFirst: jest.fn().mockResolvedValue(null) },
      offerPhoto: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return tx;
  }
  it('creates one operational record using the authoritative source and keeps its FK', async () => {
    const tx = setup();
    expect(await reserveCatalogueVehicle(tx as never, 'org-1', source)).toBe(
      'vehicle-1',
    );
    expect(tx.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceOfferVehicleId: 'source-1',
          brand: 'Geely',
          currency: 'CNY',
          color: 'SILVER',
          specs: { create: expect.objectContaining({ color: 'ARGENTÉ' }) },
        }),
      }),
    );
  });
  it('reuses an available unit after cancellation instead of duplicating it', async () => {
    const tx = setup({
      id: 'reused',
      sourceOfferVehicleId: 'source-1',
      status: 'available',
    });
    expect(await reserveCatalogueVehicle(tx as never, 'org-1', source)).toBe(
      'reused',
    );
    expect(tx.vehicle.create).not.toHaveBeenCalled();
  });
  it('rejects an existing unit linked to an active dossier', async () => {
    const tx = setup({ id: 'reused', status: 'available' });
    tx.dossierVehicle.findFirst.mockResolvedValue({ id: 'other-dossier' });
    await expect(
      reserveCatalogueVehicle(tx as never, 'org-1', source),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.vehicle.create).not.toHaveBeenCalled();
  });
});
