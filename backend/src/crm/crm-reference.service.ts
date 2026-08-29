import { Injectable, NotFoundException } from '@nestjs/common';
import { type CrmReferenceKind as Kind } from '@auto-import/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCrmReferenceDto } from './dto/crm-reference.dto';

@Injectable()
export class CrmReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.crmReferenceValue.findMany({
      where: { organizationId },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { labelFr: 'asc' }],
    });
  }

  async assertReference(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string | undefined,
    kind: Kind,
    required = false,
  ) {
    if (!id) {
      if (required) throw new NotFoundException(`${kind} is required`);
      return null;
    }
    const value = await tx.crmReferenceValue.findFirst({
      where: { id, organizationId, kind, active: true },
    });
    if (!value) throw new NotFoundException(`${kind} not found`);
    return value;
  }

  async findByCode(
    tx: Prisma.TransactionClient,
    organizationId: string,
    kind: Kind,
    code: string,
  ) {
    return tx.crmReferenceValue.findUnique({
      where: { organizationId_kind_code: { organizationId, kind, code } },
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateCrmReferenceDto,
    userId: string,
  ) {
    const existing = await this.prisma.crmReferenceValue.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('CRM reference not found');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.crmReferenceValue.update({
        where: { id },
        data: {
          ...dto,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CRM_REFERENCE_UPDATED',
          entityType: 'CrmReferenceValue',
          entityId: id,
          oldValues: { kind: existing.kind, code: existing.code },
          newValues: { changedFields: Object.keys(dto).sort() },
        },
      });
      return updated;
    });
  }
}
