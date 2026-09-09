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
  CreateSupplierReferenceDto,
  LookupQueryDto,
  UpdateInsuranceRateDto,
  UpdateLookupValueDto,
  UpsertDeliveryRateDto,
  UpsertDutyRateDto,
} from './configuration.dto';
import {
  DEFAULT_SUPPLIER_REFERENCES,
  normalizeReferenceValue,
  normalizeVehicleLookupValue,
  supplierReferenceCode,
  supplierReferenceDbKind,
} from './supplier-reference';

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
    const value = dto.value.trim().replace(/\s+/g, ' ');
    if (!value) throw new BadRequestException('La valeur est obligatoire.');
    if (dto.kind === 'MODEL' && !dto.parentId) {
      throw new BadRequestException('Un modèle doit appartenir à une marque.');
    }
    if (dto.kind === 'VERSION' && !dto.parentId) {
      throw new BadRequestException('Une version doit appartenir à un modèle.');
    }
    if (dto.parentId) {
      const parent = await this.prisma.vehicleLookupValue.findFirst({
        where: { id: dto.parentId, organizationId, active: true },
      });
      if (
        !parent ||
        (dto.kind === 'MODEL' && parent.kind !== 'BRAND') ||
        (dto.kind === 'VERSION' && parent.kind !== 'MODEL')
      ) {
        throw new BadRequestException('Référence parente invalide.');
      }
    }
    const normalizedValue = normalizeVehicleLookupValue(value);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${dto.kind}:${dto.parentId ?? 'root'}:${normalizedValue}`}))`;
      const existing = await tx.vehicleLookupValue.findFirst({
        where: {
          organizationId,
          kind: dto.kind,
          normalizedValue,
          parentId: dto.parentId ?? null,
        },
      });
      if (existing) {
        if (!existing.active) {
          return tx.vehicleLookupValue.update({
            where: { id: existing.id },
            data: { active: true, value },
          });
        }
        throw new ConflictException('Cette valeur existe déjà.');
      }
      return tx.vehicleLookupValue.create({
        data: {
          organizationId,
          kind: dto.kind,
          value,
          normalizedValue,
          parentId: dto.parentId,
          createdBy: userId,
        },
      });
    });
  }

  async listSupplierReferences(organizationId: string) {
    await this.prisma.crmReferenceValue.createMany({
      data: DEFAULT_SUPPLIER_REFERENCES.map(({ kind, value }, sortOrder) => ({
        organizationId,
        kind: supplierReferenceDbKind(kind),
        code: supplierReferenceCode(kind, value),
        labelFr: kind === 'CURRENCY' ? value.toUpperCase() : value,
        sortOrder,
      })),
      skipDuplicates: true,
    });
    return this.prisma.crmReferenceValue.findMany({
      where: {
        organizationId,
        kind: { in: ['SUPPLIER_COUNTRY', 'SUPPLIER_CURRENCY'] },
        active: true,
      },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { labelFr: 'asc' }],
    });
  }

  async createSupplierReference(
    organizationId: string,
    userId: string,
    dto: CreateSupplierReferenceDto,
  ) {
    const raw = dto.value.trim().replace(/\s+/g, ' ');
    if (!raw) throw new BadRequestException('La valeur est obligatoire.');
    if (raw.length > 100)
      throw new BadRequestException(
        'La valeur ne peut pas dépasser 100 caractères.',
      );
    const value = dto.kind === 'CURRENCY' ? raw.toUpperCase() : raw;
    if (dto.kind === 'CURRENCY' && !/^[A-Z]{3}$/.test(value)) {
      throw new BadRequestException(
        'Le code devise doit contenir exactement 3 lettres (ex. EUR).',
      );
    }
    const kind = supplierReferenceDbKind(dto.kind);
    const code = supplierReferenceCode(dto.kind, value);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:${kind}:${code}`}))`;
      const candidates = await tx.crmReferenceValue.findMany({
        where: { organizationId, kind },
      });
      const existing = candidates.find(
        (candidate) =>
          candidate.code === code ||
          normalizeReferenceValue(candidate.labelFr) ===
            normalizeReferenceValue(value),
      );
      if (existing?.active)
        throw new ConflictException('Cette valeur existe déjà.');
      const saved = existing
        ? await tx.crmReferenceValue.update({
            where: { id: existing.id },
            data: { active: true, labelFr: value },
          })
        : await tx.crmReferenceValue.create({
            data: { organizationId, kind, code, labelFr: value },
          });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SUPPLIER_REFERENCE_CREATED',
          entityType: 'CrmReferenceValue',
          entityId: saved.id,
          newValues: { kind: dto.kind, value },
        },
      });
      return saved;
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
    if (!current)
      throw new NotFoundException('Valeur de référence introuvable.');
    const value = dto.value?.trim();
    if (dto.value !== undefined && !value)
      throw new BadRequestException(
        'La valeur de référence ne peut pas être vide.',
      );
    if (value) {
      const duplicate = await this.prisma.vehicleLookupValue.findFirst({
        where: {
          organizationId,
          kind: current.kind,
          parentId: current.parentId,
          normalizedValue: normalizeVehicleLookupValue(value),
          id: { not: id },
        },
      });
      if (duplicate) throw new ConflictException('Cette valeur existe déjà.');
    }
    return this.prisma.vehicleLookupValue.update({
      where: { id },
      data: {
        value,
        normalizedValue: value ? normalizeVehicleLookupValue(value) : undefined,
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
      this.prisma.organizationSettings.findUnique({
        where: { organizationId },
      }),
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
        duties: dutyRates.some(
          (rate) => rate.active && rate.ratePercent != null,
        ),
        delivery: deliveryRates.some(
          (rate) => rate.active && rate.amount != null,
        ),
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
          dto.ratePercent === undefined
            ? null
            : new Prisma.Decimal(dto.ratePercent),
        active: dto.active ?? true,
      },
      update: {
        ratePercent:
          dto.ratePercent === undefined
            ? null
            : new Prisma.Decimal(dto.ratePercent),
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
        amount:
          dto.amount === undefined ? null : new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'DZD',
        active: dto.active ?? true,
      },
      update: {
        amount:
          dto.amount === undefined ? null : new Prisma.Decimal(dto.amount),
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
    if (!dossier) throw new NotFoundException('Dossier introuvable.');
    if (dossier.priceLockedAt) {
      // A commercial dossier snapshots exactly its selected CIF or DDP basis.
      // The other basis is legitimately null; never rebuild a locked snapshot.
      const selectedPrice =
        dossier.type === 'VEHICLE_SALE_DDP'
          ? dossier.ddpPrice
          : dossier.type === 'VEHICLE_SALE_CIF'
            ? dossier.cifPrice
            : (dossier.cifPrice ?? dossier.ddpPrice);
      const missing = [
        ...(selectedPrice == null ||
        !selectedPrice.isFinite() ||
        !selectedPrice.gt(0)
          ? ['prix commercial historique']
          : []),
        ...(!dossier.priceCurrency?.trim()
          ? ['devise du prix historique']
          : []),
      ];
      return {
        available: missing.length === 0,
        locked: true,
        cifPrice:
          dossier.cifPrice == null ? undefined : Number(dossier.cifPrice),
        ddpPrice:
          dossier.ddpPrice == null ? undefined : Number(dossier.ddpPrice),
        currency: dossier.priceCurrency,
        missing,
      };
    }
    const missing: string[] = [];
    const purchase = dossier.purchases[0];
    const dossierVehicle = dossier.dossierVehicles[0]?.vehicle;
    const shipment = dossierVehicle?.shipmentVehicles[0]?.shipment;
    if (!purchase) missing.push('coût d’achat fournisseur');
    if (!dossierVehicle) missing.push('véhicule');
    if (!shipment?.totalFreightCost) missing.push('coût total du fret');
    if (!shipment?.freightCurrency) missing.push('devise du fret');
    if (
      purchase &&
      shipment?.freightCurrency &&
      purchase.currency !== shipment.freightCurrency
    )
      missing.push('taux de conversion des devises');
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    if (settings?.insuranceRatePercent == null)
      missing.push('taux d’assurance');
    const category = dossierVehicle?.bodyType?.trim();
    const dutyRate = category
      ? await this.prisma.vehicleDutyRate.findFirst({
          where: { organizationId, category, active: true },
        })
      : null;
    if (!dossier.dutyOverrideAmount && !category)
      missing.push('catégorie du véhicule');
    if (!dossier.dutyOverrideAmount && dutyRate?.ratePercent == null)
      missing.push('taux de droits de douane');
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
    if (!destination) missing.push('destination de livraison');
    if (deliveryRate?.amount == null) missing.push('tarif de livraison locale');
    if (missing.length) {
      return {
        available: false,
        locked: Boolean(dossier.priceLockedAt),
        missing,
      };
    }
    if (
      settings?.insuranceRatePercent == null ||
      dutyRate?.ratePercent == null ||
      deliveryRate?.amount == null
    ) {
      throw new BadRequestException(
        'La configuration tarifaire du dossier est incomplète.',
      );
    }
    const shipmentVehicles = shipment.vehicles.map((item) => item.vehicle);
    const volume = (vehicle: (typeof shipmentVehicles)[number]) =>
      vehicle.lengthCm && vehicle.widthCm && vehicle.heightCm
        ? (Number(vehicle.lengthCm) *
            Number(vehicle.widthCm) *
            Number(vehicle.heightCm)) /
          1_000_000
        : 0;
    const totalVolume = shipmentVehicles.reduce(
      (sum, vehicle) => sum + volume(vehicle),
      0,
    );
    const totalWeight = shipmentVehicles.reduce(
      (sum, vehicle) => sum + Number(vehicle.weightKg ?? 0),
      0,
    );
    if (!totalVolume || !totalWeight || !dossierVehicle.weightKg) {
      return {
        available: false,
        locked: Boolean(dossier.priceLockedAt),
        missing: ['COMPLETE_VEHICLE_DIMENSIONS_AND_WEIGHT'],
      };
    }
    const capacityVolume = shipment.capacityVolumeM3
      ? Number(shipment.capacityVolumeM3)
      : Number(shipment.containerPreset?.maxVolumeM3 ?? 0);
    const capacityWeight = shipment.capacityWeightKg
      ? Number(shipment.capacityWeightKg)
      : Number(shipment.containerPreset?.maxPayloadKg ?? 0);
    const weightBinding =
      capacityWeight > 0 &&
      totalWeight / capacityWeight >
        totalVolume / Math.max(capacityVolume, 0.001);
    const share = weightBinding
      ? Number(dossierVehicle.weightKg) / totalWeight
      : volume(dossierVehicle) / totalVolume;
    const freight = Number(shipment.totalFreightCost) * share;
    const base = Number(purchase.purchasePrice);
    const insurance =
      (base + freight) * (Number(settings.insuranceRatePercent) / 100);
    const cifPrice = base + freight + insurance;
    const duty = dossier.dutyOverrideAmount
      ? Number(dossier.dutyOverrideAmount)
      : cifPrice * (Number(dutyRate.ratePercent) / 100);
    const ddpPrice = cifPrice + duty + Number(deliveryRate.amount);
    return {
      available: true,
      locked: Boolean(dossier.priceLockedAt),
      cifPrice,
      ddpPrice,
      currency: purchase.currency,
      freightAllocation: freight,
      allocationBasis: weightBinding ? 'WEIGHT' : 'VOLUME',
      insurance,
      customsDuty: duty,
      localDelivery: Number(deliveryRate.amount),
      missing: [],
    };
  }

  async refreshDossierPricing(dossierId: string, organizationId: string) {
    const pricing = await this.calculateDossierPricing(
      dossierId,
      organizationId,
    );
    if (!pricing.available || pricing.locked) return pricing;
    const { cifPrice, ddpPrice, currency } = pricing;
    if (
      cifPrice == null ||
      ddpPrice == null ||
      !currency ||
      !Number.isFinite(cifPrice) ||
      !Number.isFinite(ddpPrice)
    ) {
      throw new BadRequestException(
        'La configuration tarifaire du dossier est incomplète.',
      );
    }
    // Do not overwrite a price locked concurrently after the calculation.
    const updated = await this.prisma.dossier.updateMany({
      where: { id: dossierId, organizationId, priceLockedAt: null },
      data: {
        cifPrice: new Prisma.Decimal(cifPrice),
        ddpPrice: new Prisma.Decimal(ddpPrice),
        priceCurrency: currency,
      },
    });
    if (updated.count === 0)
      return this.calculateDossierPricing(dossierId, organizationId);
    return pricing;
  }
}
