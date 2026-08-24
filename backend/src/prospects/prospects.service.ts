import {
  Injectable,
  NotFoundException,
  Logger,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/helpers/pagination.helper';
import { CreateProspectDto } from './dto/create-prospect.dto';
import { UpdateProspectDto } from './dto/update-prospect.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ConvertProspectDto } from './dto/convert-prospect.dto';
import { FilterProspectDto } from './dto/filter-prospect.dto';
import { ContactResolutionService } from '../crm/contact-resolution.service';

const PROSPECT_TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'interested', 'lost'],
  contacted: ['interested', 'qualified', 'lost'],
  interested: ['qualified', 'offerSent', 'lost'],
  qualified: ['offerSent', 'negotiating', 'won', 'lost'],
  offerSent: ['negotiating', 'won', 'lost'],
  negotiating: ['won', 'lost'],
  won: ['converted'],
  lost: ['contacted'],
  converted: [],
};

@Injectable()
export class ProspectsService {
  private readonly logger = new Logger(ProspectsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly contacts?: ContactResolutionService,
  ) {}

  async create(
    createProspectDto: CreateProspectDto,
    userId: string,
    organizationId: string,
  ) {
    const assignedTo = createProspectDto.assignedTo || userId;
    const prospect = await this.prisma.$transaction(
      async (transaction) => {
        await this.assertTenantAssignee(
          transaction,
          assignedTo,
          organizationId,
        );
        const prospect = await transaction.prospect.create({
          data: { ...createProspectDto, organizationId, assignedTo },
          include: { activities: true, client: true },
        });
        if (this.contacts) {
          await this.contacts.syncProspectContacts(
            transaction,
            organizationId,
            prospect.id,
            createProspectDto.phone,
            createProspectDto.email,
          );
        }
        return prospect;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Prospect created: ${prospect.firstName} ${prospect.lastName} (${prospect.id})`,
    );
    return prospect;
  }

  async findAll(
    organizationId: string,
    page: number = 1,
    limit: number = 20,
    filters?: FilterProspectDto,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ProspectWhereInput = { organizationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.assignedTo) where.assignedTo = filters.assignedTo;
    if (filters?.source) where.source = filters.source;
    if (filters?.qualification) where.qualification = filters.qualification;
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
          assignee: { select: { id: true, firstName: true, lastName: true } },
          tasks: {
            where: { status: { notIn: ['completed', 'cancelled'] } },
            orderBy: { dueDate: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.prospect.count({ where }),
    ]);

    return paginate(prospects, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const prospect = await this.prisma.prospect.findFirst({
      where: { id, organizationId },
      include: {
        activities: {
          orderBy: { activityDate: 'desc' },
        },
        client: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        contactPoints: true,
        tasks: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!prospect) {
      throw new NotFoundException(`Prospect with ID ${id} not found`);
    }

    return prospect;
  }

  async update(
    id: string,
    organizationId: string,
    updateProspectDto: UpdateProspectDto,
    changedBy: string,
  ) {
    const prospect = await this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.prospect.findFirst({
          where: { id, organizationId },
          select: { id: true, status: true },
        });
        if (!existing) throw new NotFoundException('Prospect not found');
        if (updateProspectDto.assignedTo) {
          await this.assertTenantAssignee(
            transaction,
            updateProspectDto.assignedTo,
            organizationId,
          );
        }
        if (
          updateProspectDto.status &&
          updateProspectDto.status !== existing.status &&
          !PROSPECT_TRANSITIONS[existing.status]?.includes(
            updateProspectDto.status,
          )
        ) {
          throw new ConflictException(
            `Invalid prospect transition ${existing.status} -> ${updateProspectDto.status}`,
          );
        }
        const { nextActionAt, ...data } = updateProspectDto;
        const updated = await transaction.prospect.update({
          where: { id },
          data: {
            ...data,
            ...(nextActionAt ? { nextActionAt: new Date(nextActionAt) } : {}),
          },
          include: { activities: true, client: true },
        });
        if (
          updateProspectDto.phone !== undefined ||
          updateProspectDto.email !== undefined
        ) {
          if (this.contacts) {
            await this.contacts.syncProspectContacts(
              transaction,
              organizationId,
              id,
              updateProspectDto.phone,
              updateProspectDto.email,
            );
          }
        }
        if (
          updateProspectDto.status &&
          updateProspectDto.status !== existing.status
        ) {
          await transaction.prospectStatusHistory.create({
            data: {
              organizationId,
              prospectId: id,
              changedBy,
              fromStatus: existing.status,
              toStatus: updateProspectDto.status,
            },
          });
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(
      `Prospect updated: ${prospect.firstName} ${prospect.lastName} (${id})`,
    );
    return prospect;
  }

  async remove(id: string, organizationId: string) {
    const prospect = await this.findOne(id, organizationId);

    if (prospect?.client) {
      throw new ConflictException(
        'Cannot delete prospect that has been converted to a client',
      );
    }

    await this.prisma.prospect.delete({
      where: { id },
    });

    this.logger.log(`Prospect deleted: ${id}`);
    return { message: 'Prospect deleted successfully' };
  }

  async addActivity(
    createActivityDto: CreateActivityDto,
    userId: string,
    organizationId: string,
  ) {
    const prospect = await this.findOne(
      createActivityDto.prospectId,
      organizationId,
    );

    const activity = await this.prisma.prospectActivity.create({
      data: {
        ...createActivityDto,
        userId,
        activityDate: createActivityDto.activityDate || new Date(),
      },
    });
    await this.prisma.prospect.update({
      where: { id: prospect.id },
      data: { lastInteractionAt: activity.activityDate },
    });

    this.logger.log(
      `Activity added to prospect ${prospect.id} by user ${userId}`,
    );
    return activity;
  }

  async convertToClient(
    id: string,
    convertProspectDto: ConvertProspectDto,
    userId: string,
    organizationId: string,
  ) {
    const prospect = await this.findOne(id, organizationId);

    if (prospect.client) return prospect.client;

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
          passportExpiry: convertProspectDto.passportExpiry
            ? new Date(convertProspectDto.passportExpiry)
            : undefined,
          nationality: convertProspectDto.nationality,
          address: convertProspectDto.address,
          assignedTo: prospect.assignedTo,
          lastInteractionAt: prospect.lastInteractionAt,
          nextActionAt: prospect.nextActionAt,
        },
      });

      // Update prospect status
      await prisma.prospect.update({
        where: { id },
        data: { status: 'converted', convertedAt: new Date() },
      });

      await prisma.contactPoint.updateMany({
        where: { organizationId, prospectId: id },
        data: { prospectId: null, clientId: newClient.id },
      });

      await prisma.task.updateMany({
        where: { organizationId, prospectId: id },
        data: { prospectId: null, clientId: newClient.id },
      });

      await prisma.prospectStatusHistory.create({
        data: {
          organizationId,
          prospectId: id,
          changedBy: userId,
          fromStatus: prospect.status,
          toStatus: 'converted',
        },
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

  private async assertTenantAssignee(
    transaction: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const user = await transaction.user.findFirst({
      where: { id: userId, organizationId, status: 'active' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Assignee not found');
  }
}
