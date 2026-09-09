import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortDto } from './dto/shipments.dto';

@Injectable()
export class PortsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.port.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async create(organizationId: string, userId: string, dto: CreatePortDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const port = await tx.port.create({
          data: {
            organizationId,
            name: dto.name.trim(),
            code: dto.code.trim().toUpperCase(),
            country: dto.country?.trim(),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            action: 'PORT_CREATED',
            entityType: 'Port',
            entityId: port.id,
            newValues: { name: port.name, code: port.code },
          },
        });
        return port;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Un port avec ce code existe déjà.');
      throw error;
    }
  }
}
