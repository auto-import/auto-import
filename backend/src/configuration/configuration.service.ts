import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLookupValueDto,
  LookupQueryDto,
  UpdateInsuranceRateDto,
  UpdateLookupValueDto,
  UpsertDeliveryRateDto,
  UpsertDutyRateDto,
} from './configuration.dto';

@Injectable()
export class ConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  listLookups(organizationId: string, query: LookupQueryDto) {
    return this.prisma.vehicleLookupValue.findMany({
      where: {
        organizationId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.parentId ? { parentId: query.parentId } : {}),
        ...(query.includeInactive === 'true' ? {} : { active: true }),
      },
      include: { parent: true, _count: { select: { children: true } } },
      orderBy: [{ kind: 'asc' }, { value: 'asc' }],
    });
  }

  async createLookup(
    organizationId: string,
    userId: string,
    dto: CreateLookupValueDto,
  ) {
    const value = dto.value.trim();
    if (!value) throw new BadRequestException('Lookup value is required');
    if (dto.kind === 'MODEL' && !dto.parentId) {
      throw new BadRequestException('A model must belong to a brand');
    }
    if (dto.parentId) {
      const parent = await this.prisma.vehicleLookupValue.findFirst({
        where: { id: dto.parentId, organizationId, active: true },
      });
      if (!parent || (dto.kind === 'MODEL' && parent.kind !== 'BRAND')) {
        throw new BadRequestException('Invalid lookup parent');
      }
    }
    const normalizedValue = value.toLocaleLowerCase('fr').normalize('NFKC');
    const existing = await this.prisma.vehicleLookupValue.findFirst({
      where: { organizationId, kind: dto.kind, normalizedValue, parentId: dto.parentId ?? null },
    });
    if (existing) {
      if (!existing.active) {
        return this.prisma.vehicleLookupValue.update({
          where: { id: existing.id },
          data: { active: true, value },
        });
      }
      return existing;
    }
    return this.prisma.vehicleLookupValue.create({
      data: {
        organizationId,
        kind: dto.kind,
        value,
        normalizedValue,
        parentId: dto.parentId,
        createdBy: userId,
      },
    });
  }

  async updateLookup(
    id: string,
    organizationId: string,
    dto: UpdateLookupValueDto,
  ) {
    const current = await this.prisma.vehicleLookupValue.findFirst({
      where: { id, organizationId },
    });
    if (!current) throw new NotFoundException('Lookup value not found');
    const value = dto.value?.trim();
    if (dto.value !== undefined && !value)
      throw new BadRequestException('Lookup value cannot be blank');
    if (value) {
      const duplicate = await this.prisma.vehicleLookupValue.findFirst({
        where: {
          organizationId,
          kind: current.kind,
          parentId: current.parentId,
          normalizedValue: value.toLocaleLowerCase('fr').normalize('NFKC'),
          id: { not: id },
        },
      });
      if (duplicate) throw new ConflictException('Lookup value already exists');
    }
    return this.prisma.vehicleLookupValue.update({
      where: { id },
      data: {
        value,
        normalizedValue: value
          ? value.toLocaleLowerCase('fr').normalize('NFKC')
          : undefined,
        active: dto.active,
      },
    });
  }

  containerPresets(organizationId: string) {
    return this.prisma.containerPreset.findMany({
      where: { organizationId, active: true },
      orderBy: { internalLengthCm: 'asc' },
    });
  }

  async pricingSettings(organizationId: string) {
    const [settings, dutyRates, deliveryRates] = await Promise.all([
      this.prisma.organizationSettings.findUnique({ where: { organizationId } }),
      this.prisma.vehicleDutyRate.findMany({
        where: { organizationId },
        orderBy: { category: 'asc' },
      }),
      this.prisma.localDeliveryRate.findMany({
        where: { organizationId },
        orderBy: { destination: 'asc' },
      }),
    ]);
    return {
      insuranceRatePercent: settings?.insuranceRatePercent ?? null,
      dutyRates,
      deliveryRates,
      configured: {
        insurance: settings?.insuranceRatePercent != null,
        duties: dutyRates.some((rate) => rate.active && rate.ratePercent != null),
        delivery: deliveryRates.some((rate) => rate.active && rate.amount != null),
      },
    };
  }

  updateInsurance(organizationId: string, dto: UpdateInsuranceRateDto) {
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        insuranceRatePercent:
          dto.insuranceRatePercent === undefined
            ? null
            : new Prisma.Decimal(dto.insuranceRatePercent),
      },
      update: {
        insuranceRatePercent:
          dto.insuranceRatePercent === undefined
            ? null
            : new Prisma.Decimal(dto.insuranceRatePercent),
      },
    });
  }

  upsertDuty(organizationId: string, dto: UpsertDutyRateDto) {
    const category = dto.category.trim();
    return this.prisma.vehicleDutyRate.upsert({
      where: { organizationId_category: { organizationId, category } },
      create: {
        organizationId,
        category,
        ratePercent:
          dto.ratePercent === undefined ? null : new Prisma.Decimal(dto.ratePercent),
        active: dto.active ?? true,
      },
      update: {
        ratePercent:
          dto.ratePercent === undefined ? null : new Prisma.Decimal(dto.ratePercent),
        active: dto.active,
      },
    });
  }

  upsertDelivery(organizationId: string, dto: UpsertDeliveryRateDto) {
    const destination = dto.destination.trim();
    return this.prisma.localDeliveryRate.upsert({
      where: { organizationId_destination: { organizationId, destination } },
      create: {
        organizationId,
        destination,
        amount: dto.amount === undefined ? null : new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'DZD',
        active: dto.active ?? true,
      },
      update: {
        amount: dto.amount === undefined ? null : new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        active: dto.active,
      },
    });
  }

  async calculateDossierPricing(dossierId: string, organizationId: string) {
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
      include: {
        purchases: { orderBy: { createdAt: 'desc' }, take: 1 },
        dossierVehicles: {
          include: {
            vehicle: {
              include: {
                shipmentVehicles: {
                  include: {
                    shipment: {
                      include: {
                        containerPreset: true,
                        vehicles: { include: { vehicle: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!dossier) throw new NotFoundException('Dossier not found');
    if (dossier.cifPrice && dossier.ddpPrice && dossier.priceLockedAt) {
      return {
        available: true,
        locked: true,
        cifPrice: Number(dossier.cifPrice),
        ddpPrice: Number(dossier.ddpPrice),
        currency: dossier.priceCurrency,
        missing: [],
      };
    }
    const missing: string[] = [];
    const purchase = dossier.purchases[0];
    const dossierVehicle = dossier.dossierVehicles[0]?.vehicle;
    const shipment = dossierVehicle?.shipmentVehicles[0]?.shipment;
    if (!purchase) missing.push('FOB_FCA_PURCHASE_COST');
    if (!dossierVehicle) missing.push('VEHICLE');
    if (!shipment?.totalFreightCost) missing.push('TOTAL_FREIGHT_COST');
    if (!shipment?.freightCurrency) missing.push('FREIGHT_CURRENCY');
    if (
      purchase &&
      shipment?.freightCurrency &&
      purchase.currency !== shipment.freightCurrency
    ) missing.push('CURRENCY_CONVERSION_REQUIRED');
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    if (settings?.insuranceRatePercent == null) missing.push('INSURANCE_RATE');
    const category = dossierVehicle?.bodyType?.trim();
    const dutyRate = category
      ? await this.prisma.vehicleDutyRate.findFirst({
          where: { organizationId, category, active: true },
        })
      : null;
    if (!dossier.dutyOverrideAmount && !category) missing.push('VEHICLE_CATEGORY');
    if (!dossier.dutyOverrideAmount && dutyRate?.ratePercent == null)
      missing.push('CUSTOMS_DUTY_RATE');
    const destination = shipment?.arrivalPort?.trim();
    const deliveryRate = destination
      ? await this.prisma.localDeliveryRate.findFirst({
          where: {
            organizationId,
            active: true,
            destination: { in: [destination, 'DEFAULT'] },
          },
          orderBy: { destination: 'desc' },
        })
      : null;
    if (!destination) missing.push('DELIVERY_DESTINATION');
    if (deliveryRate?.amount == null) missing.push('LOCAL_DELIVERY_RATE');
    if (missing.length) {
      return { available: false, locked: Boolean(dossier.priceLockedAt), missing };
    }
    const shipmentVehicles = shipment!.vehicles.map((item) => item.vehicle);
    const volume = (vehicle: (typeof shipmentVehicles)[number]) =>
      vehicle.lengthCm && vehicle.widthCm && vehicle.heightCm
        ? (Number(vehicle.lengthCm) * Number(vehicle.widthCm) * Number(vehicle.heightCm)) /
          1_000_000
        : 0;
    const totalVolume = shipmentVehicles.reduce((sum, vehicle) => sum + volume(vehicle), 0);
    const totalWeight = shipmentVehicles.reduce(
      (sum, vehicle) => sum + Number(vehicle.weightKg ?? 0),
      0,
    );
    if (!totalVolume || !totalWeight || !dossierVehicle!.weightKg) {
      return {
        available: false,
        locked: Boolean(dossier.priceLockedAt),
        missing: ['COMPLETE_VEHICLE_DIMENSIONS_AND_WEIGHT'],
      };
    }
    const capacityVolume = shipment!.capacityVolumeM3
      ? Number(shipment!.capacityVolumeM3)
      : Number(shipment!.containerPreset?.maxVolumeM3 ?? 0);
    const capacityWeight = shipment!.capacityWeightKg
      ? Number(shipment!.capacityWeightKg)
      : Number(shipment!.containerPreset?.maxPayloadKg ?? 0);
    const weightBinding =
      capacityWeight > 0 &&
      totalWeight / capacityWeight > totalVolume / Math.max(capacityVolume, 0.001);
    const share = weightBinding
      ? Number(dossierVehicle!.weightKg) / totalWeight
      : volume(dossierVehicle!) / totalVolume;
    const freight = Number(shipment!.totalFreightCost) * share;
    const base = Number(purchase!.purchasePrice);
    const insurance =
      (base + freight) * (Number(settings!.insuranceRatePercent) / 100);
    const cifPrice = base + freight + insurance;
    const duty = dossier.dutyOverrideAmount
      ? Number(dossier.dutyOverrideAmount)
      : cifPrice * (Number(dutyRate!.ratePercent) / 100);
    const ddpPrice = cifPrice + duty + Number(deliveryRate!.amount);
    return {
      available: true,
      locked: Boolean(dossier.priceLockedAt),
      cifPrice,
      ddpPrice,
      currency: purchase!.currency,
      freightAllocation: freight,
      allocationBasis: weightBinding ? 'WEIGHT' : 'VOLUME',
      insurance,
      customsDuty: duty,
      localDelivery: Number(deliveryRate!.amount),
      missing: [],
    };
  }

  async refreshDossierPricing(dossierId: string, organizationId: string) {
    const pricing = await this.calculateDossierPricing(dossierId, organizationId);
    if (!pricing.available) return pricing;
    const dossier = await this.prisma.dossier.findFirst({
      where: { id: dossierId, organizationId },
    });
    if (!dossier) return pricing;
    const lockedWithSnapshot =
      dossier.priceLockedAt && dossier.cifPrice != null && dossier.ddpPrice != null;
    if (!lockedWithSnapshot) {
      await this.prisma.dossier.update({
        where: { id: dossierId },
        data: {
          cifPrice: new Prisma.Decimal(pricing.cifPrice!),
          ddpPrice: new Prisma.Decimal(pricing.ddpPrice!),
          priceCurrency: pricing.currency,
        },
      });
    }
    return pricing;
  }
}
