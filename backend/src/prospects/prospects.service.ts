import { Injectable, NotFoundException, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';

@Injectable()
export class ProspectsService {
  private readonly logger = new Logger(ProspectsService.name);

  constructor(private prisma: PrismaService) {}

  async create(createProspectDto: CreateProspectDto, userId: string, organizationId: string) {
    const prospect = await this.prisma.prospect.create({
      data: {
        ...createProspectDto,
        organizationId,
        assignedTo: createProspectDto.assignedTo || userId,
      },
      include: {
        activities: true,
        client: true,
      },
    });

    this.logger.log(`Prospect created: ${prospect.firstName} ${prospect.lastName} (${prospect.id})`);
    return prospect;
  }

  async findAll(organizationId: string, page: number = 1, limit: number = 10, filters?: any) {
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [prospects, total] = await Promise.all([
      this.prisma.prospect.findMany({
        where,
        skip,
        take: limit,
        include: {
          activities: {
            orderBy: { activityDate: 'desc' },
            take: 3,
          },
          client: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.prospect.count({ where }),
    ]);

    return {
      items: prospects,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, organizationId?: string) {
    const prospect = await this.prisma.prospect.findFirst({
      where: { id, ...(organizationId && { organizationId }) },
      include: {
        activities: {
          orderBy: { activityDate: 'desc' },
        },
        client: true,
      },
    });

    if (!prospect) {
      throw new NotFoundException(`Prospect with ID ${id} not found`);
    }

    return prospect;
  }

  async update(id: string, organizationId: string, updateProspectDto: UpdateProspectDto) {
    await this.findOne(id, organizationId);

    const prospect = await this.prisma.prospect.update({
      where: { id },
      data: updateProspectDto,
      include: {
        activities: true,
        client: true,
      },
    });

    this.logger.log(`Prospect updated: ${prospect.firstName} ${prospect.lastName} (${id})`);
    return prospect;
  }

  async remove(id: string, organizationId: string) {
    const prospect = await this.findOne(id, organizationId);

    if (prospect?.client) {
      throw new ConflictException('Cannot delete prospect that has been converted to a client');
    }

    await this.prisma.prospect.delete({
      where: { id },
    });

    this.logger.log(`Prospect deleted: ${id}`);
    return { message: 'Prospect deleted successfully' };
  }

  async addActivity(createActivityDto: CreateActivityDto, userId: string, organizationId: string) {
    const prospect = await this.findOne(createActivityDto.prospectId, organizationId);

    const activity = await this.prisma.prospectActivity.create({
      data: {
        ...createActivityDto,
        userId,
        activityDate: createActivityDto.activityDate || new Date(),
      },
    });

    this.logger.log(`Activity added to prospect ${prospect.id} by user ${userId}`);
    return activity;
  }

  async convertToClient(id: string, convertProspectDto: ConvertProspectDto, userId: string, organizationId: string) {
    const prospect = await this.findOne(id, organizationId);

    if (prospect.client) {
      throw new ConflictException('Prospect already converted to a client');
    }

    const client = await this.prisma.$transaction(async (prisma) => {
      // Create client with same organizationId
      const newClient = await prisma.client.create({
        data: {
          organizationId: prospect.organizationId,
          prospectId: id,
          firstName: convertProspectDto.firstName || prospect.firstName,
          lastName: convertProspectDto.lastName || prospect.lastName,
          phone: convertProspectDto.phone || prospect.phone,
          email: convertProspectDto.email || prospect.email,
          passportNumber: convertProspectDto.passportNumber,
          passportExpiry: convertProspectDto.passportExpiry ? new Date(convertProspectDto.passportExpiry) : undefined,
          nationality: convertProspectDto.nationality,
          address: convertProspectDto.address,
        },
      });

      // Update prospect status
      await prisma.prospect.update({
        where: { id },
        data: { status: 'converted' },
      });

      return newClient;
    });

    this.logger.log(`Prospect converted to client: ${client.id}`);
    return client;
  }

  async getActivities(prospectId: string, organizationId: string) {
    await this.findOne(prospectId, organizationId);

    return this.prisma.prospectActivity.findMany({
      where: { prospectId },
      orderBy: { activityDate: 'desc' },
    });
  }
}
