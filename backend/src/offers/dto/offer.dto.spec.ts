import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOfferDto, CreateOfferVehicleDto } from './offer.dto';

const multipartBody = {
  supplierId: '00000000-0000-4000-8000-000000000001',
  brand: 'Geely',
  model: 'Coolray',
  condition: 'new',
  specification: '{}',
  supplierPrice: '12000',
  currency: 'USD',
  validFrom: '2026-09-01T00:00:00.000Z',
  validUntil: '2026-10-01T00:00:00.000Z',
  availableQuantity: '1',
};

describe('CreateOfferDto multipart transformation', () => {
  it('accepts an omitted vehicles field for the compatible single-line payload', async () => {
    const dto = plainToInstance(CreateOfferDto, multipartBody, {
      enableImplicitConversion: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.vehicles).toBeUndefined();
  });

  it('parses multipart vehicles JSON into validated DTO instances', async () => {
    const dto = plainToInstance(
      CreateOfferDto,
      {
        ...multipartBody,
        vehicles: JSON.stringify([
          {
            brand: 'Geely',
            model: 'Coolray',
            condition: 'new',
            supplierPrice: 12000,
            currency: 'USD',
            quantity: 1,
            specification: {},
          },
        ]),
      },
      { enableImplicitConversion: true },
    );

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.vehicles?.[0]).toBeInstanceOf(CreateOfferVehicleDto);
  });

  it('rejects invalid nested vehicle values after multipart parsing', async () => {
    const dto = plainToInstance(
      CreateOfferDto,
      {
        ...multipartBody,
        vehicles: JSON.stringify([
          {
            brand: 'Geely',
            model: '',
            condition: 'damaged',
            supplierPrice: 0,
            currency: 'GBP',
            quantity: 0,
          },
        ]),
      },
      { enableImplicitConversion: true },
    );

    const errors = await validate(dto);
    expect(
      errors.find(({ property }) => property === 'vehicles')?.children,
    ).not.toHaveLength(0);
  });

  it('accepts additional vehicles and an omitted optional VIN', async () => {
    const dto = plainToInstance(
      CreateOfferDto,
      {
        ...multipartBody,
        vehicles: JSON.stringify([
          {
            brand: 'Geely',
            model: 'Coolray',
            condition: 'new',
            supplierPrice: 12000,
            currency: 'USD',
            quantity: 1,
          },
          {
            brand: 'BYD',
            model: 'Song Plus',
            condition: 'new',
            supplierPrice: 18000,
            currency: 'USD',
            quantity: 2,
          },
        ]),
      },
      { enableImplicitConversion: true },
    );

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.vehicles).toHaveLength(2);
    expect(dto.vehicles?.every((vehicle) => vehicle.vin === undefined)).toBe(
      true,
    );
  });
});
