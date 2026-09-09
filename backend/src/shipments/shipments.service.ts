import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShipmentContainerType,
  type CustomsFile,
} from '@prisma/client';
import { containerCapacity } from './container-type';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRatesService } from '../finance/exchange-rates.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  AddShipmentVehicleDto,
  CreateShipmentDto,
  FilterShipmentsDto,
  TransitionShipmentDto,
  UpdateShipmentDto,
} from './dto/shipments.dto';

const SHIPMENT_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['booked', 'cancelled'],
  booked: ['loading', 'cancelled'],
  loading: ['inTransit', 'cancelled'],
  inTransit: ['arrived'],
  arrived: [],
  cancelled: [],
};

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockShipment(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
  }

  private async shipmentReferences(
    tx: Prisma.TransactionClient,
    organizationId: string,
    dto: CreateShipmentDto | UpdateShipmentDto,
  ) {
    const data: {
      departurePortId?: string;
      arrivalPortId?: string;
      departurePort?: string;
      arrivalPort?: string;
      containerType?: ShipmentContainerType;
    } = {};
    for (const field of ['departure', 'arrival'] as const) {
      const id = dto[`${field}PortId`];
      if (id) {
        const port = await tx.port.findFirst({ where: { id, organizationId } });
        if (!port)
          throw new NotFoundException(
            'Port introuvable dans votre organisation.',
          );
        data[`${field}PortId`] = port.id;
        data[`${field}Port`] = `${port.name} (${port.code})`;
      } else if (dto[`${field}Port`] !== undefined) {
        throw new BadRequestException(
          'Sélectionnez un port enregistré avec son identifiant.',
        );
      }
    }
    let legacyCapacity: number | undefined;
    if (dto.containerPresetId) {
      const preset = await tx.containerPreset.findFirst({
        where: { id: dto.containerPresetId, organizationId, active: true },
      });
      if (!preset)
        throw new NotFoundException('Type de conteneur introuvable.');
      legacyCapacity = preset.maxVehicles;
    }
    data.containerType =
      dto.containerType ??
      (legacyCapacity === 3
        ? ShipmentContainerType.THREE_VEHICLES
        : legacyCapacity === 4
          ? ShipmentContainerType.FOUR_VEHICLES
          : undefined);
    return data;
  }

  private assertCapacity(
    type: ShipmentContainerType | null | undefined,
    count: number,
    legacy?: number,
  ) {
    const capacity = containerCapacity(type) ?? legacy;
    if (!capacity)
      throw new BadRequestException(
        'Sélectionnez un conteneur de 3 ou 4 véhicules.',
      );
    if (count > capacity)
      throw new ConflictException({
        code: 'SHIPMENT_MAX_VEHICLES_EXCEEDED',
        message: `Ce conteneur est limité à ${capacity} véhicules.`,
        maxVehicles: capacity,
        requestedCount: count,
      });
  }

  currentDzdRates(organizationId: string) {
    return new ExchangeRatesService(this.prisma).currentDzdRates(
      organizationId,
    );
  }

  private async freightSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    amount: Prisma.Decimal | number | null | undefined,
    currency?: string | null,
    expectedRateId?: string,
  ) {
    if (amount == null) return {};
    if (!currency)
      throw new BadRequestException('La devise du fret est obligatoire.');
    const snapshot = await new ExchangeRatesService(
      this.prisma,
    ).findActiveDzdRateSnapshot(tx, organizationId, currency);
    if (expectedRateId && snapshot.exchangeRateId !== expectedRateId)
      throw new ConflictException(
        'Le taux Finance a changé. Rouvrez le formulaire.',
      );
    const original = new Prisma.Decimal(amount);
    const amountDzd = original.mul(snapshot.rate).toDecimalPlaces(2);
    if (
      !amountDzd.isFinite() ||
      amountDzd.lt(0) ||
      amountDzd.gte('10000000000')
    )
      throw new BadRequestException(
        'Le montant du fret dépasse la limite comptable.',
      );
    return {
      freightExchangeRateId: snapshot.exchangeRateId,
      freightExchangeRateSnapshot: snapshot.rate,
      freightAmountDzd: amountDzd,
    };
  }

  /**
   * Recalculate the per-vehicle freight share for every vehicle in a shipment.
   * Uses container capacity (maxVehicles) as divisor, NOT the actual vehicle count.
   * Business rule: 1 vehicle = totalFreight / maxVehicles.
   */
  private async recalculateFreightShares(
    tx: Prisma.TransactionClient,
    shipmentId: string,
  ) {
    const shipment = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { containerPreset: true, vehicles: true },
    });
    const maxVehicles =
      containerCapacity(shipment.containerType) ??
      shipment.containerPreset?.maxVehicles;
    if (!maxVehicles || shipment.totalFreightCost == null) return;
    const perVehicle = new Prisma.Decimal(shipment.totalFreightCost)
      .div(maxVehicles)
      .toDecimalPlaces(2);
    for (const sv of shipment.vehicles) {
      await tx.shipmentVehicle.update({
        where: { id: sv.id },
        data: {
          freightShare: perVehicle,
          freightCurrency: shipment.freightCurrency,
        },
      });
    }
  }

  private async generateShipmentNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `shipment:${year}` },
      },
      create: { organizationId, key: `shipment:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `SHP-${year}-${String(sequence.value).padStart(5, '0')}`;
  }

  async create(organizationId: string, userId: string, dto: CreateShipmentDto) {
    if (dto.carrierPartnerId) {
      const carrier = await this.prisma.partner.findFirst({
        where: { id: dto.carrierPartnerId, organizationId },
      });
      if (!carrier) throw new NotFoundException('Carrier partner not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const references = await this.shipmentReferences(tx, organizationId, dto);
      this.assertCapacity(
        references.containerType,
        dto.vehicleIds?.length ?? 0,
      );
      const shipmentNumber = await this.generateShipmentNumber(
        tx,
        organizationId,
      );

      const shipment = await tx.shipment.create({
        data: {
          ...(await this.freightSnapshot(
            tx,
            organizationId,
            dto.totalFreightCost,
            dto.freightCurrency,
            dto.freightExchangeRateId,
          )),
          organizationId,
          shipmentNumber,
          carrierPartnerId: dto.carrierPartnerId,
          blNumber: dto.blNumber,
          vesselName: dto.vesselName,
          containerNumber: dto.containerNumber,
          departurePort: dto.departurePort,
          arrivalPort: dto.arrivalPort,
          etd: dto.etd ? new Date(dto.etd) : undefined,
          eta: dto.eta ? new Date(dto.eta) : undefined,
          status: 'pending',
          notes: dto.notes,
          containerPresetId: dto.containerPresetId,
          totalFreightCost: dto.totalFreightCost,
          freightCurrency: dto.freightCurrency,
          ...references,
          statusHistory: {
            create: {
              toStatus: 'pending',
              changedBy: userId,
              comment: 'Shipment created',
            },
          },
        },
      });

      if (dto.vehicleIds && dto.vehicleIds.length > 0) {
        for (const vehicleId of dto.vehicleIds) {
          await this.assignVehicle(tx, shipment.id, organizationId, userId, {
            vehicleId,
            capacityOverride: false,
          });
        }
        await this.recalculateFreightShares(tx, shipment.id);
      }

      return tx.shipment.findUnique({
        where: { id: shipment.id },
        include: {
          containerPreset: true,
          departurePortRecord: true,
          arrivalPortRecord: true,
          carrierPartner: true,
          vehicles: {
            include: {
              vehicle: true,
            },
          },
          statusHistory: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      });
    });
  }

  async update(id: string, organizationId: string, dto: UpdateShipmentDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockShipment(tx, id, organizationId);
      const shipment = await tx.shipment.findFirst({
        where: { id, organizationId },
        include: { containerPreset: true, vehicles: true },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      const references = await this.shipmentReferences(tx, organizationId, dto);
      this.assertCapacity(
        references.containerType ?? shipment.containerType,
        shipment.vehicles.length,
        shipment.containerPreset?.maxVehicles,
      );
      if (
        dto.carrierPartnerId &&
        !(await tx.partner.findFirst({
          where: { id: dto.carrierPartnerId, organizationId },
        }))
      )
        throw new NotFoundException('Carrier partner not found');

      const updated = await tx.shipment.update({
        where: { id },
        data: {
          ...((dto.totalFreightCost !== undefined ||
            dto.freightCurrency !== undefined) &&
          (!shipment.freightExchangeRateSnapshot ||
            (dto.totalFreightCost !== undefined &&
              !shipment.totalFreightCost?.eq(dto.totalFreightCost)) ||
            (dto.freightCurrency !== undefined &&
              dto.freightCurrency !== shipment.freightCurrency))
            ? await this.freightSnapshot(
                tx,
                organizationId,
                dto.totalFreightCost ?? shipment.totalFreightCost,
                dto.freightCurrency ?? shipment.freightCurrency,
                dto.freightExchangeRateId,
              )
            : {}),
          carrierPartnerId:
            dto.carrierPartnerId !== undefined
              ? dto.carrierPartnerId
              : shipment.carrierPartnerId,
          blNumber:
            dto.blNumber !== undefined ? dto.blNumber : shipment.blNumber,
          vesselName:
            dto.vesselName !== undefined ? dto.vesselName : shipment.vesselName,
          containerNumber:
            dto.containerNumber !== undefined
              ? dto.containerNumber
              : shipment.containerNumber,
          departurePort:
            dto.departurePort !== undefined
              ? dto.departurePort
              : shipment.departurePort,
          arrivalPort:
            dto.arrivalPort !== undefined
              ? dto.arrivalPort
              : shipment.arrivalPort,
          etd: dto.etd ? new Date(dto.etd) : shipment.etd,
          eta: dto.eta ? new Date(dto.eta) : shipment.eta,
          actualDepartureDate: dto.actualDepartureDate
            ? new Date(dto.actualDepartureDate)
            : shipment.actualDepartureDate,
          actualArrivalDate: dto.actualArrivalDate
            ? new Date(dto.actualArrivalDate)
            : shipment.actualArrivalDate,
          notes: dto.notes !== undefined ? dto.notes : shipment.notes,
          containerPresetId:
            dto.containerPresetId !== undefined
              ? dto.containerPresetId
              : shipment.containerPresetId,
          totalFreightCost:
            dto.totalFreightCost !== undefined
              ? dto.totalFreightCost
              : shipment.totalFreightCost,
          freightCurrency:
            dto.freightCurrency !== undefined
              ? dto.freightCurrency
              : shipment.freightCurrency,
          ...references,
        },
        include: {
          containerPreset: true,
          departurePortRecord: true,
          arrivalPortRecord: true,
          carrierPartner: true,
          vehicles: { include: { vehicle: true } },
        },
      });

      await this.recalculateFreightShares(tx, id);
      return tx.shipment.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          containerPreset: true,
          departurePortRecord: true,
          arrivalPortRecord: true,
          vehicles: { include: { vehicle: true } },
          carrierPartner: true,
        },
      });
    });
  }

  async transition(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionShipmentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockShipment(tx, id, organizationId);
      const shipment = await tx.shipment.findFirst({
        where: { id, organizationId },
      });
      if (!shipment) throw new NotFoundException('Shipment not found');
      if (shipment.status === dto.status) return shipment;
      if (!SHIPMENT_TRANSITIONS[shipment.status]?.includes(dto.status)) {
        throw new ConflictException({
          code: 'SHIPMENT_INVALID_TRANSITION',
          message: `${shipment.status} cannot transition to ${dto.status}`,
        });
      }

      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: id,
          fromStatus: shipment.status,
          toStatus: dto.status,
          changedBy: userId,
          comment: dto.comment,
        },
      });

      // Dossier-linked vehicles retain the authoritative dossier milestone workflow.
      // Apply inventory departure before reading the response relations.
      if (dto.status === 'inTransit') {
        await tx.vehicle.updateMany({
          where: {
            organizationId,
            archivedAt: null,
            status: { in: ['available', 'reserved'] },
            shipmentVehicles: { some: { shipmentId: id } },
            dossierVehicles: {
              none: {
                dossier: {
                  status: {
                    notIn: ['closed', 'serviceCompleted', 'cancelled'],
                  },
                },
              },
            },
          },
          data: { status: 'inTransit' },
        });
      }

      const updated = await tx.shipment.update({
        where: { id },
        data: {
          status: dto.status,
          actualDepartureDate:
            dto.status === 'inTransit' && !shipment.actualDepartureDate
              ? new Date()
              : shipment.actualDepartureDate,
          actualArrivalDate:
            dto.status === 'arrived' && !shipment.actualArrivalDate
              ? new Date()
              : shipment.actualArrivalDate,
        },
        include: {
          carrierPartner: true,
          vehicles: { include: { vehicle: true } },
          statusHistory: {
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      });

      if (dto.status === 'arrived') {
        await this.createCustomsFilesInTransaction(
          tx,
          id,
          organizationId,
          userId,
        );
      }

      return updated;
    });
  }

  async createCustomsFromShipment(
    shipmentId: string,
    organizationId: string,
    userId: string,
    responsibleUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) =>
      this.createCustomsFilesInTransaction(
        tx,
        shipmentId,
        organizationId,
        userId,
        responsibleUserId,
      ),
    );
  }

  async addVehicle(
    shipmentId: string,
    organizationId: string,
    userId: string,
    dto: AddShipmentVehicleDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockShipment(tx, shipmentId, organizationId);
      await this.assignVehicle(tx, shipmentId, organizationId, userId, dto);
      await this.recalculateFreightShares(tx, shipmentId);
    });
    return this.findOne(shipmentId, organizationId);
  }

  private async assignVehicle(
    tx: Prisma.TransactionClient,
    shipmentId: string,
    organizationId: string,
    userId: string,
    dto: AddShipmentVehicleDto,
  ) {
    const shipment = await tx.shipment.findFirst({
      where: { id: shipmentId, organizationId },
      include: {
        containerPreset: true,
        vehicles: { include: { vehicle: true } },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (!['pending', 'booked', 'loading'].includes(shipment.status))
      throw new ConflictException(
        'Le chargement de cette expédition est fermé.',
      );
    // Serialize assignments of the same vehicle across different containers.
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${dto.vehicleId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const vehicle = await tx.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId, archivedAt: null },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (['sold', 'delivered', 'rejected'].includes(vehicle.status))
      throw new ConflictException('Ce véhicule ne peut pas être chargé.');
    if (
      await tx.shipmentVehicle.findFirst({
        where: {
          vehicleId: vehicle.id,
          shipmentId: { not: shipmentId },
          shipment: { status: { notIn: ['arrived', 'cancelled'] } },
        },
      })
    )
      throw new ConflictException(
        'Ce véhicule est déjà affecté à une autre expédition active.',
      );
    if (shipment.vehicles.some((item) => item.vehicleId === vehicle.id)) {
      throw new ConflictException(
        'Vehicle is already assigned to this shipment',
      );
    }

    // ── Hard vehicle count enforcement (no override allowed) ──
    this.assertCapacity(
      shipment.containerType,
      shipment.vehicles.length + 1,
      shipment.containerPreset?.maxVehicles,
    );

    const capacity = this.capacitySummary(shipment);
    const nextVolume = this.vehicleVolume(vehicle);
    const warnings: string[] = [];
    if (shipment.containerPreset) {
      const preset = shipment.containerPreset;
      if (
        vehicle.lengthCm &&
        vehicle.widthCm &&
        vehicle.heightCm &&
        !this.physicallyFits(vehicle, preset)
      ) {
        warnings.push('PHYSICAL_DIMENSIONS_EXCEED_CONTAINER');
      }
      if (
        nextVolume !== null &&
        capacity.remainingVolumeM3 !== null &&
        nextVolume > capacity.remainingVolumeM3
      )
        warnings.push('VOLUME_CAPACITY_EXCEEDED');
      if (
        vehicle.weightKg &&
        capacity.remainingWeightKg !== null &&
        Number(vehicle.weightKg) > capacity.remainingWeightKg
      )
        warnings.push('WEIGHT_CAPACITY_EXCEEDED');
    }
    if (
      !vehicle.lengthCm ||
      !vehicle.widthCm ||
      !vehicle.heightCm ||
      !vehicle.weightKg
    )
      warnings.push('VEHICLE_CAPACITY_DATA_INCOMPLETE');
    const exceeds = warnings.some((warning) => warning.includes('EXCEED'));
    if (exceeds && !dto.capacityOverride) {
      throw new ConflictException({
        code: 'SHIPMENT_CAPACITY_OVERRIDE_REQUIRED',
        warnings,
        capacity,
        message: 'Capacity would be exceeded; explicit override is required.',
      });
    }
    if (exceeds && !dto.overrideReason?.trim()) {
      throw new BadRequestException('An override reason is required');
    }
    await tx.shipmentVehicle.create({
      data: {
        shipmentId,
        vehicleId: vehicle.id,
        addedBy: userId,
        capacityOverride: exceeds,
        overrideReason: exceeds ? dto.overrideReason : undefined,
      },
    });
    if (exceeds) {
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId,
          fromStatus: shipment.status,
          toStatus: shipment.status,
          changedBy: userId,
          comment: `Capacity override for vehicle ${vehicle.vin ?? vehicle.id}: ${dto.overrideReason} (${warnings.join(', ')})`,
        },
      });
    }
  }

  async removeVehicle(
    shipmentId: string,
    vehicleId: string,
    organizationId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockShipment(tx, shipmentId, organizationId);
      const shipment = await tx.shipment.findFirst({
        where: { id: shipmentId, organizationId },
      });
      if (!shipment) throw new NotFoundException('Expédition introuvable.');
      if (!['pending', 'booked', 'loading'].includes(shipment.status))
        throw new ConflictException(
          'Le chargement de cette expédition est fermé.',
        );

      const link = await tx.shipmentVehicle.findFirst({
        where: { shipmentId, vehicleId },
      });
      if (!link)
        throw new NotFoundException(
          "Ce véhicule n'est pas affecté à cette expédition.",
        );

      await tx.shipmentVehicle.delete({ where: { id: link.id } });
      await this.recalculateFreightShares(tx, shipmentId);
    });

    return this.findOne(shipmentId, organizationId);
  }

  private async createCustomsFilesInTransaction(
    tx: Prisma.TransactionClient,
    shipmentId: string,
    organizationId: string,
    actorId: string,
    requestedResponsible?: string,
  ) {
    const shipment = await tx.shipment.findFirst({
      where: { id: shipmentId, organizationId },
      include: {
        vehicles: {
          include: {
            vehicle: {
              include: {
                dossierVehicles: {
                  include: { dossier: true },
                },
              },
            },
          },
        },
      },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (requestedResponsible) {
      const responsible = await tx.user.findFirst({
        where: { id: requestedResponsible, organizationId, status: 'active' },
        select: { id: true },
      });
      if (!responsible)
        throw new NotFoundException('Responsible user not found');
    }
    const created: CustomsFile[] = [];
    const ambiguous: Array<{ vehicleId: string; dossierIds: string[] }> = [];
    const dossierVehicles = new Map<
      string,
      {
        dossier: (typeof shipment.vehicles)[number]['vehicle']['dossierVehicles'][number]['dossier'];
        vehicleIds: string[];
      }
    >();
    for (const shipmentVehicle of shipment.vehicles) {
      const candidates = shipmentVehicle.vehicle.dossierVehicles
        .map((link) => link.dossier)
        .filter((dossier) => !['closed', 'cancelled'].includes(dossier.status));
      if (candidates.length !== 1) {
        ambiguous.push({
          vehicleId: shipmentVehicle.vehicleId,
          dossierIds: candidates.map((dossier) => dossier.id),
        });
        continue;
      }
      const dossier = candidates[0];
      const group = dossierVehicles.get(dossier.id) ?? {
        dossier,
        vehicleIds: [],
      };
      group.vehicleIds.push(shipmentVehicle.vehicleId);
      dossierVehicles.set(dossier.id, group);
    }
    for (const { dossier, vehicleIds } of dossierVehicles.values()) {
      const existing = await tx.customsFile.findFirst({
        where: {
          organizationId,
          dossierId: dossier.id,
        },
      });
      if (existing) {
        created.push(existing);
        continue;
      }
      const year = new Date().getUTCFullYear();
      const sequence = await tx.commerceSequence.upsert({
        where: {
          organizationId_key: { organizationId, key: `customs:${year}` },
        },
        create: { organizationId, key: `customs:${year}`, value: 1 },
        update: { value: { increment: 1 } },
      });
      const responsibleUserId =
        requestedResponsible ?? dossier.opsUserId ?? dossier.salesUserId;
      try {
        const file = await tx.customsFile.create({
          data: {
            organizationId,
            reference: `CUST-${year}-${String(sequence.value).padStart(5, '0')}`,
            shipmentId,
            vehicleId: vehicleIds[0],
            dossierId: dossier.id,
            responsibleUserId,
            status: 'open',
            v2Status:
              shipment.status === 'arrived'
                ? 'ARRIVED_AT_PORT'
                : 'AWAITING_ARRIVAL',
            containerSnapshot: shipment.containerNumber,
            blSnapshot: shipment.blNumber,
            arrivalPortSnapshot: shipment.arrivalPort,
            statusHistory: {
              create: {
                toStatus:
                  shipment.status === 'arrived'
                    ? 'ARRIVED_AT_PORT'
                    : 'AWAITING_ARRIVAL',
                changedBy: actorId,
                comment: 'Created idempotently from maritime shipment',
              },
            },
          },
        });
        await tx.customsFileVehicle.createMany({
          data: vehicleIds.map((vehicleId) => ({
            customsFileId: file.id,
            vehicleId,
          })),
          skipDuplicates: true,
        });
        await tx.task.upsert({
          where: {
            organizationId_automationKey: {
              organizationId,
              automationKey: `customs-arrival:${file.id}`,
            },
          },
          create: {
            organizationId,
            assignedTo: responsibleUserId,
            createdBy: actorId,
            title: `Préparer le dossier douanier ${file.reference}`,
            type: 'customs_arrival',
            status: 'todo',
            dossierId: dossier.id,
            relatedType: 'customsFile',
            relatedId: file.id,
            automationKey: `customs-arrival:${file.id}`,
          },
          update: {},
        });
        await tx.notification.createMany({
          data: [
            {
              organizationId,
              userId: responsibleUserId,
              type: 'CUSTOMS_FILE_READY',
              category: 'customs',
              severity: 'warning',
              title: `Dossier douanier ${file.reference}`,
              relatedType: 'customsFile',
              relatedId: file.id,
              entityUrl: '/expeditions',
              dedupeKey: `customs-ready:${file.id}:${responsibleUserId}`,
            },
          ],
          skipDuplicates: true,
        });
        created.push(file);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const canonical = await tx.customsFile.findFirst({
            where: {
              organizationId,
              dossierId: dossier.id,
              v2Status: { not: null },
            },
          });
          if (canonical) {
            created.push(canonical);
            continue;
          }
        }
        throw error;
      }
    }
    return { created, ambiguous };
  }

  async findAll(organizationId: string, filter: FilterShipmentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.ShipmentWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.carrierPartnerId
        ? { carrierPartnerId: filter.carrierPartnerId }
        : {}),
      ...(filter.containerNumber
        ? {
            containerNumber: {
              contains: filter.containerNumber,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(filter.blNumber
        ? { blNumber: { contains: filter.blNumber, mode: 'insensitive' } }
        : {}),
      ...(filter.search
        ? {
            OR: [
              {
                shipmentNumber: {
                  contains: filter.search,
                  mode: 'insensitive',
                },
              },
              { vesselName: { contains: filter.search, mode: 'insensitive' } },
              {
                containerNumber: {
                  contains: filter.search,
                  mode: 'insensitive',
                },
              },
              { blNumber: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          carrierPartner: { select: { id: true, name: true } },
          containerPreset: true,
          vehicles: {
            include: {
              vehicle: {
                select: {
                  id: true,
                  brand: true,
                  model: true,
                  vin: true,
                  lengthCm: true,
                  widthCm: true,
                  heightCm: true,
                  weightKg: true,
                },
              },
            },
          },
          customsFiles: true,
          costs: { where: { status: 'POSTED' } },
        },
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return paginate(
      items.map((item) => ({ ...item, capacity: this.capacitySummary(item) })),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string, organizationId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, organizationId },
      include: {
        carrierPartner: true,
        containerPreset: true,
        vehicles: {
          include: {
            vehicle: {
              include: {
                supplier: true,
                dossierVehicles: {
                  include: { dossier: { include: { client: true } } },
                },
              },
            },
            order: true,
          },
        },
        customsFiles: true,
        documents: { include: { file: true, dossier: true } },
        costs: {
          include: {
            actorUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        shippingCosts: true,
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!shipment) throw new NotFoundException('Shipment not found');
    return { ...shipment, capacity: this.capacitySummary(shipment) };
  }

  private vehicleVolume(vehicle: {
    lengthCm: Prisma.Decimal | null;
    widthCm: Prisma.Decimal | null;
    heightCm: Prisma.Decimal | null;
  }): number | null {
    if (!vehicle.lengthCm || !vehicle.widthCm || !vehicle.heightCm) return null;
    return (
      (Number(vehicle.lengthCm) *
        Number(vehicle.widthCm) *
        Number(vehicle.heightCm)) /
      1_000_000
    );
  }

  private physicallyFits(
    vehicle: {
      lengthCm: Prisma.Decimal | null;
      widthCm: Prisma.Decimal | null;
      heightCm: Prisma.Decimal | null;
    },
    preset: {
      internalLengthCm: Prisma.Decimal;
      internalWidthCm: Prisma.Decimal;
      internalHeightCm: Prisma.Decimal;
    },
  ) {
    const length = Number(vehicle.lengthCm);
    const width = Number(vehicle.widthCm);
    const height = Number(vehicle.heightCm);
    return (
      height <= Number(preset.internalHeightCm) &&
      ((length <= Number(preset.internalLengthCm) &&
        width <= Number(preset.internalWidthCm)) ||
        (width <= Number(preset.internalLengthCm) &&
          length <= Number(preset.internalWidthCm)))
    );
  }

  private capacitySummary(shipment: {
    containerType?: ShipmentContainerType | null;
    containerPreset?: {
      maxVolumeM3: Prisma.Decimal;
      maxPayloadKg: Prisma.Decimal;
    } | null;
    capacityVolumeM3?: Prisma.Decimal | null;
    capacityWeightKg?: Prisma.Decimal | null;
    vehicles: Array<{
      vehicle: {
        lengthCm: Prisma.Decimal | null;
        widthCm: Prisma.Decimal | null;
        heightCm: Prisma.Decimal | null;
        weightKg: Prisma.Decimal | null;
      };
    }>;
  }) {
    const totalVolume = shipment.capacityVolumeM3
      ? Number(shipment.capacityVolumeM3)
      : shipment.containerPreset
        ? Number(shipment.containerPreset.maxVolumeM3)
        : null;
    const totalWeight = shipment.capacityWeightKg
      ? Number(shipment.capacityWeightKg)
      : shipment.containerPreset
        ? Number(shipment.containerPreset.maxPayloadKg)
        : null;
    const usedVolumeM3 = shipment.vehicles.reduce(
      (sum, item) => sum + (this.vehicleVolume(item.vehicle) ?? 0),
      0,
    );
    const usedWeightKg = shipment.vehicles.reduce(
      (sum, item) => sum + Number(item.vehicle.weightKg ?? 0),
      0,
    );
    const maxVehicles =
      containerCapacity(shipment.containerType) ??
      ('containerPreset' in shipment &&
        (shipment as { containerPreset?: { maxVehicles?: number } | null })
          .containerPreset?.maxVehicles) ??
      null;
    const totalFreight =
      'totalFreightCost' in shipment
        ? Number(
            (shipment as { totalFreightCost?: Prisma.Decimal | null })
              .totalFreightCost ?? 0,
          )
        : null;
    const freightCurrency =
      'freightCurrency' in shipment
        ? (shipment as { freightCurrency?: string | null }).freightCurrency
        : null;
    const freightPerVehicle =
      maxVehicles && totalFreight
        ? Number(
            new Prisma.Decimal(totalFreight)
              .div(maxVehicles)
              .toDecimalPlaces(2),
          )
        : null;
    return {
      usedVolumeM3,
      remainingVolumeM3:
        totalVolume === null ? null : totalVolume - usedVolumeM3,
      totalVolumeM3: totalVolume,
      usedWeightKg,
      remainingWeightKg:
        totalWeight === null ? null : totalWeight - usedWeightKg,
      totalWeightKg: totalWeight,
      vehicleCount: shipment.vehicles.length,
      maxVehicles,
      freightPerVehicle,
      freightCurrency,
    };
  }
}
