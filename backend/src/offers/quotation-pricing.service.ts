import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { QuotationAmountsDto } from './dto/quotation.dto';

@Injectable()
export class QuotationPricingService {
  calculate(priceBasis: 'CIF' | 'DDP', dto: QuotationAmountsDto) {
    const vehicleAmount = new Prisma.Decimal(dto.vehicleAmount);
    const containerPrice = new Prisma.Decimal(dto.containerPrice);
    const containerAllocation = dto.containerAllocation;
    const freightAmount = containerPrice
      .div(containerAllocation)
      .toDecimalPlaces(2);
    const insuranceAmount = new Prisma.Decimal(dto.insuranceAmount ?? 0);
    const customsAmount = new Prisma.Decimal(dto.customsAmount ?? 0);
    const transitAmount = new Prisma.Decimal(dto.transitAmount ?? 0);
    const marginAmount = new Prisma.Decimal(dto.marginAmount ?? 0);
    const otherCostsAmount = (dto.otherCosts ?? []).reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0),
    );
    const cifAmount = vehicleAmount
      .add(freightAmount)
      .add(insuranceAmount)
      .add(transitAmount)
      .add(otherCostsAmount);
    const ddpAmount = cifAmount.add(customsAmount);
    const finalCustomerPrice = priceBasis === 'DDP' ? ddpAmount : cifAmount;
    return {
      vehicleAmount,
      containerPrice,
      containerAllocation,
      freightAmount,
      insuranceAmount,
      customsAmount,
      transitAmount,
      otherCostsAmount,
      marginAmount,
      cifAmount,
      ddpAmount,
      finalCustomerPrice,
    };
  }

  async usdToDzdSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    at: Date,
  ) {
    const direct = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: 'USD',
        quoteCurrency: 'DZD',
        effectiveAt: { lte: at },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    if (direct && direct.rate.greaterThan(0)) {
      return { exchangeRateId: direct.id, rate: direct.rate };
    }
    const inverse = await tx.exchangeRate.findFirst({
      where: {
        organizationId,
        baseCurrency: 'DZD',
        quoteCurrency: 'USD',
        effectiveAt: { lte: at },
        rate: { gt: 0 },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    if (inverse) {
      return {
        exchangeRateId: inverse.id,
        rate: new Prisma.Decimal(1).div(inverse.rate),
      };
    }
    throw new ConflictException(
      'Aucun taux USD vers DZD applicable. Ajoutez un taux dans Finance avant de créer le devis.',
    );
  }
}
