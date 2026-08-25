import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import {
  CreateShipmentDto,
  FilterShipmentsDto,
  TransitionShipmentDto,
  UpdateShipmentDto,
} from './dto/shipments.dto';

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

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
      const shipmentNumber = await this.generateShipmentNumber(
        tx,
        organizationId,
      );

      const shipment = await tx.shipment.create({
        data: {
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
          const vehicle = await tx.vehicle.findFirst({
            where: { id: vehicleId, organizationId },
          });
          if (vehicle) {
            await tx.shipmentVehicle.create({
              data: {
                shipmentId: shipment.id,
                vehicleId,
              },
            });
          }
        }
      }

      return tx.shipment.findUnique({
        where: { id: shipment.id },
        include: {
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
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, organizationId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const updated = await this.prisma.shipment.update({
      where: { id },
      data: {
        carrierPartnerId: dto.carrierPartnerId !== undefined ? dto.carrierPartnerId : shipment.carrierPartnerId,
        blNumber: dto.blNumber !== undefined ? dto.blNumber : shipment.blNumber,
        vesselName: dto.vesselName !== undefined ? dto.vesselName : shipment.vesselName,
        containerNumber: dto.containerNumber !== undefined ? dto.containerNumber : shipment.containerNumber,
        departurePort: dto.departurePort !== undefined ? dto.departurePort : shipment.departurePort,
        arrivalPort: dto.arrivalPort !== undefined ? dto.arrivalPort : shipment.arrivalPort,
        etd: dto.etd ? new Date(dto.etd) : shipment.etd,
        eta: dto.eta ? new Date(dto.eta) : shipment.eta,
        actualDepartureDate: dto.actualDepartureDate ? new Date(dto.actualDepartureDate) : shipment.actualDepartureDate,
        actualArrivalDate: dto.actualArrivalDate ? new Date(dto.actualArrivalDate) : shipment.actualArrivalDate,
        notes: dto.notes !== undefined ? dto.notes : shipment.notes,
      },
      include: {
        carrierPartner: true,
        vehicles: { include: { vehicle: true } },
      },
    });

    return updated;
  }

  async transition(
    id: string,
    organizationId: string,
    userId: string,
    dto: TransitionShipmentDto,
  ) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, organizationId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: id,
          fromStatus: shipment.status,
          toStatus: dto.status,
          changedBy: userId,
          comment: dto.comment,
        },
      });

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

      return updated;
    });
  }

  async findAll(organizationId: string, filter: FilterShipmentsDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;

    const where: Prisma.ShipmentWhereInput = {
      organizationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.carrierPartnerId ? { carrierPartnerId: filter.carrierPartnerId } : {}),
      ...(filter.containerNumber ? { containerNumber: { contains: filter.containerNumber, mode: 'insensitive' } } : {}),
      ...(filter.blNumber ? { blNumber: { contains: filter.blNumber, mode: 'insensitive' } } : {}),
      ...(filter.search
        ? {
            OR: [
              { shipmentNumber: { contains: filter.search, mode: 'insensitive' } },
              { vesselName: { contains: filter.search, mode: 'insensitive' } },
              { containerNumber: { contains: filter.search, mode: 'insensitive' } },
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
          vehicles: {
            include: {
              vehicle: { select: { id: true, brand: true, model: true, vin: true } },
            },
          },
          customsFiles: true,
          costs: { where: { status: 'POSTED' } },
        },
      }),
      this.prisma.shipment.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, organizationId },
      include: {
        carrierPartner: true,
        vehicles: {
          include: {
            vehicle: true,
            order: true,
          },
        },
        customsFiles: true,
        costs: {
          include: { actorUser: { select: { id: true, firstName: true, lastName: true } } },
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
    return shipment;
  }
}
