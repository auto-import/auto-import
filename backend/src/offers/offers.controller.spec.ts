import { OffersController } from './offers.controller';
import type { CreateOfferDto } from './dto/offer.dto';
import type { OffersService } from './offers.service';

describe('OffersController', () => {
  it('creates a supplier offer without forcing photo uploads', async () => {
    const offer = { id: 'offer-1', reference: 'OFF-2026-00001' };
    const offers = { create: jest.fn().mockResolvedValue(offer) };
    const controller = new OffersController(
      offers as unknown as OffersService,
    );
    const dto = {
      supplierId: '00000000-0000-4000-8000-000000000001',
      brand: 'Geely',
      model: 'Coolray',
      condition: 'new',
      specification: {},
      supplierPrice: 12_000,
      currency: 'USD',
      validFrom: '2026-08-30T00:00:00.000Z',
      validUntil: '2026-09-30T00:00:00.000Z',
      availableQuantity: 1,
    } as CreateOfferDto;

    await expect(
      controller.create(
        dto,
        {
          id: 'user-1',
          organizationId: 'org-1',
        } as never,
      ),
    ).resolves.toEqual(offer);
    expect(offers.create).toHaveBeenCalledWith(dto, 'org-1', 'user-1');
  });
});
