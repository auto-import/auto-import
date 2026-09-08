/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from './exchange-rates.service';

describe('ExchangeRatesService DZD quotation rates', () => {
  it.each(['USD', 'CNY'])(
    'creates an active %s -> DZD Finance rate',
    async (currency) => {
      const create = jest.fn().mockImplementation(({ data }) => data);
      const service = new ExchangeRatesService({
        exchangeRate: { create },
      } as never);

      await service.create('org-1', 'user-1', {
        baseCurrency: currency,
        quoteCurrency: 'DZD',
        rate: 20,
        isActive: true,
        effectiveAt: '2026-09-08T10:00:00.000Z',
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            baseCurrency: currency,
            quoteCurrency: 'DZD',
            rate: new Prisma.Decimal(20),
            isActive: true,
          }),
        }),
      );
    },
  );

  it('rejects unsupported and reversed pairs', async () => {
    const service = new ExchangeRatesService({} as never);
    await expect(
      service.create('org-1', 'user-1', {
        baseCurrency: 'EUR',
        quoteCurrency: 'DZD',
        rate: 150,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('org-1', 'user-1', {
        baseCurrency: 'USD',
        quoteCurrency: 'CNY',
        rate: 7,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses only an active direct rate effective at the snapshot instant', async () => {
    const at = new Date('2026-09-08T10:00:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({
      id: 'rate-cny',
      rate: new Prisma.Decimal('19.75'),
    });
    const service = new ExchangeRatesService({} as never);
    const result = await service.findActiveDzdRateSnapshot(
      { exchangeRate: { findFirst } } as never,
      'org-1',
      'CNY',
      at,
    );

    expect(result.rate.toString()).toBe('19.75');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          baseCurrency: 'CNY',
          quoteCurrency: 'DZD',
          isActive: true,
          effectiveAt: { lte: at },
        },
      }),
    );
  });

  it('never returns a false zero when the active rate is missing', async () => {
    const service = new ExchangeRatesService({} as never);
    await expect(
      service.findActiveDzdRateSnapshot(
        {
          exchangeRate: { findFirst: jest.fn().mockResolvedValue(null) },
        } as never,
        'org-1',
        'USD',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('activates and deactivates only a rate from the current organization', async () => {
    const tx = {
      exchangeRate: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'rate-1', isActive: true }),
        update: jest.fn().mockResolvedValue({ id: 'rate-1', isActive: false }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ExchangeRatesService({
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as never);

    await service.setActive('org-1', 'user-1', 'rate-1', false);
    expect(tx.exchangeRate.findFirst).toHaveBeenCalledWith({
      where: { id: 'rate-1', organizationId: 'org-1' },
    });
    expect(tx.exchangeRate.update).toHaveBeenCalledWith({
      where: { id: 'rate-1' },
      data: { isActive: false },
    });
  });
});
