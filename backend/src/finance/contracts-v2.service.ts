import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContractCollectionDto,
  CreateContractDto,
  SignContractDto,
} from './dto/contracts-v2.dto';

@Injectable()
export class ContractsV2Service {
  constructor(private readonly prisma: PrismaService) {}

  private async nextNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getUTCFullYear();
    const row = await tx.commerceSequence.upsert({
      where: {
        organizationId_key: { organizationId, key: `contract:${year}` },
      },
      create: { organizationId, key: `contract:${year}`, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `CTR-${year}-${String(row.value).padStart(5, '0')}`;
  }

  async create(organizationId: string, userId: string, dto: CreateContractDto) {
    const total = new Prisma.Decimal(dto.totalAmount);
    const scheduled = dto.schedule.reduce(
      (sum, item) => sum.add(item.amount),
      new Prisma.Decimal(0),
    );
    if (!scheduled.equals(total)) {
      throw new BadRequestException(
        'Payment schedule must equal contract total',
      );
    }
    if (new Prisma.Decimal(dto.requiredDeposit ?? 0).greaterThan(total)) {
      throw new BadRequestException('Required deposit cannot exceed total');
    }
    return this.prisma.$transaction(async (tx) => {
      const dossier = await tx.dossier.findFirst({
        where: { id: dto.dossierId, organizationId, clientId: dto.clientId },
        select: { id: true },
      });
      if (!dossier) throw new NotFoundException('Client dossier not found');
      if (dto.signedDocumentId) {
        const document = await tx.gedDocument.findFirst({
          where: { id: dto.signedDocumentId, organizationId, archivedAt: null },
          select: { id: true },
        });
        if (!document) throw new NotFoundException('Signed document not found');
      }
      const contract = await tx.contract.create({
        data: {
          organizationId,
          contractNumber: await this.nextNumber(tx, organizationId),
          clientId: dto.clientId,
          dossierId: dto.dossierId,
          totalAmount: total,
          currency: dto.currency.toUpperCase(),
          requiredDeposit: dto.requiredDeposit ?? 0,
          signedDocumentId: dto.signedDocumentId,
          invoiceId: dto.invoiceId,
          createdBy: userId,
          schedule: {
            create: dto.schedule.map((item, index) => ({
              sequence: index + 1,
              label: item.label,
              amount: item.amount,
              dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
            })),
          },
        },
        include: { schedule: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CONTRACT_CREATED',
          entityType: 'Contract',
          entityId: contract.id,
          newValues: {
            currency: contract.currency,
            scheduleItems: contract.schedule.length,
          },
        },
      });
      return contract;
    });
  }

  async sign(
    id: string,
    organizationId: string,
    userId: string,
    dto: SignContractDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.findFirst({
        where: { id, organizationId },
      });
      if (!contract) throw new NotFoundException('Contract not found');
      if (contract.status === 'SIGNED') return contract;
      if (contract.status !== 'DRAFT')
        throw new ConflictException('Only draft contracts can be signed');
      const document = await tx.gedDocument.findFirst({
        where: { id: dto.signedDocumentId, organizationId, archivedAt: null },
      });
      if (!document) throw new NotFoundException('Signed document not found');
      const updated = await tx.contract.update({
        where: { id },
        data: {
          status: 'SIGNED',
          signedAt: dto.signedAt ? new Date(dto.signedAt) : new Date(),
          signedDocumentId: document.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CONTRACT_SIGNED',
          entityType: 'Contract',
          entityId: id,
        },
      });
      return updated;
    });
  }

  async collect(
    id: string,
    organizationId: string,
    userId: string,
    dto: CreateContractCollectionDto,
  ) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, organizationId },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'SIGNED')
      throw new ConflictException('Signed contract required');
    if (dto.currency.toUpperCase() !== contract.currency) {
      throw new BadRequestException('Collection currency must match contract');
    }
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.contractId !== id || !existing.amount.equals(dto.amount)) {
          throw new ConflictException(
            'Idempotency key already used for another collection',
          );
        }
        return existing;
      }
    }
    return this.prisma.payment.create({
      data: {
        organizationId,
        clientId: contract.clientId,
        dossierId: contract.dossierId,
        contractId: contract.id,
        amount: dto.amount,
        unallocatedAmount: dto.amount,
        currency: contract.currency,
        paymentMethod: dto.paymentMethod,
        reference: dto.reference,
        idempotencyKey: dto.idempotencyKey,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        actorUserId: userId,
        status: 'PENDING',
      },
    });
  }

  async findOne(id: string, organizationId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, organizationId, archivedAt: null },
      include: {
        client: true,
        dossier: true,
        schedule: { orderBy: { sequence: 'asc' } },
        payments: {
          where: { status: 'CONFIRMED' },
          orderBy: { paymentDate: 'asc' },
        },
        signedDocument: {
          select: { id: true, title: true, sensitivity: true },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const paid = contract.payments.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    );
    const remaining = Prisma.Decimal.max(contract.totalAmount.minus(paid), 0);
    return {
      ...contract,
      totalPaid: paid.toString(),
      remainingBalance: remaining.toString(),
      collectionStatus: remaining.equals(0)
        ? 'PAID'
        : paid.greaterThanOrEqualTo(contract.requiredDeposit)
          ? 'DEPOSIT'
          : paid.greaterThan(0)
            ? 'PARTIAL'
            : 'SIGNED',
    };
  }

  async findAll(organizationId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        contractNumber: true,
        totalAmount: true,
        currency: true,
        requiredDeposit: true,
        status: true,
        signedAt: true,
        client: { select: { id: true, firstName: true, lastName: true } },
        dossier: { select: { id: true, reference: true } },
      },
    });
    return Promise.all(
      contracts.map((contract) => this.findOne(contract.id, organizationId)),
    );
  }
}
