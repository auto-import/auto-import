import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ContactPointKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedContact {
  normalizedValue: string;
  prospectId: string | null;
  clientId: string | null;
  created: boolean;
}

@Injectable()
export class ContactResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePhone(value: string): string {
    const input = value.trim();
    const digits = input.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestException('Invalid phone number');
    }
    if (input.startsWith('+')) return `+${digits}`;
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    if (digits.startsWith('213')) return `+${digits}`;
    if (digits.startsWith('0')) return `+213${digits.slice(1)}`;
    if (digits.length === 9) return `+213${digits}`;
    return `+${digits}`;
  }

  normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  async resolvePhone(
    organizationId: string,
    phone: string,
    source: 'INBOUND_CALL' | 'WHATSAPP',
    preferredAssigneeId?: string,
  ): Promise<ResolvedContact> {
    const normalizedValue = this.normalizePhone(phone);
    const existing = await this.findPhone(organizationId, normalizedValue);
    if (existing) return { normalizedValue, ...existing, created: false };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const contact = await tx.contactPoint.findUnique({
              where: {
                organizationId_kind_normalizedValue: {
                  organizationId,
                  kind: ContactPointKind.PHONE,
                  normalizedValue,
                },
              },
              select: { prospectId: true, clientId: true },
            });
            if (contact) {
              return { normalizedValue, ...contact, created: false };
            }

            const assignee = preferredAssigneeId
              ? await tx.user.findFirst({
                  where: {
                    id: preferredAssigneeId,
                    organizationId,
                    status: 'active',
                  },
                  select: { id: true },
                })
              : await tx.user.findFirst({
                  where: { organizationId, status: 'active' },
                  orderBy: { createdAt: 'asc' },
                  select: { id: true },
                });
            if (!assignee) {
              throw new ConflictException(
                'No active employee is available to own the new lead',
              );
            }

            const prospect = await tx.prospect.create({
              data: {
                organizationId,
                firstName:
                  source === 'WHATSAPP' ? 'Contact WhatsApp' : 'Appel entrant',
                lastName: normalizedValue.slice(-4),
                phone,
                source,
                assignedTo: assignee.id,
                lastInteractionAt: new Date(),
              },
              select: { id: true },
            });
            await tx.contactPoint.create({
              data: {
                organizationId,
                kind: ContactPointKind.PHONE,
                displayValue: phone,
                normalizedValue,
                whatsappEnabled: true,
                preferred: true,
                prospectId: prospect.id,
              },
            });
            return {
              normalizedValue,
              prospectId: prospect.id,
              clientId: null,
              created: true,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          const winner = await this.findPhone(organizationId, normalizedValue);
          if (winner) {
            return { normalizedValue, ...winner, created: false };
          }
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Could not resolve contact concurrently');
  }

  async syncProspectContacts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    prospectId: string,
    phone?: string | null,
    email?: string | null,
  ): Promise<void> {
    await this.syncOwnerContacts(
      tx,
      organizationId,
      { prospectId },
      phone,
      email,
    );
  }

  async syncClientContacts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    clientId: string,
    phone?: string | null,
    email?: string | null,
  ): Promise<void> {
    await this.syncOwnerContacts(
      tx,
      organizationId,
      { clientId },
      phone,
      email,
    );
  }

  private async syncOwnerContacts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    owner: { prospectId: string } | { clientId: string },
    phone?: string | null,
    email?: string | null,
  ): Promise<void> {
    const ownerWhere = 'prospectId' in owner ? owner : owner;
    if (phone !== undefined) {
      await tx.contactPoint.deleteMany({
        where: { ...ownerWhere, kind: ContactPointKind.PHONE },
      });
      if (phone) {
        await tx.contactPoint.create({
          data: {
            organizationId,
            ...owner,
            kind: ContactPointKind.PHONE,
            displayValue: phone,
            normalizedValue: this.normalizePhone(phone),
            whatsappEnabled: true,
            preferred: true,
          },
        });
      }
    }
    if (email !== undefined) {
      await tx.contactPoint.deleteMany({
        where: { ...ownerWhere, kind: ContactPointKind.EMAIL },
      });
      if (email) {
        await tx.contactPoint.create({
          data: {
            organizationId,
            ...owner,
            kind: ContactPointKind.EMAIL,
            displayValue: email,
            normalizedValue: this.normalizeEmail(email),
            preferred: true,
          },
        });
      }
    }
  }

  private async findPhone(organizationId: string, normalizedValue: string) {
    return this.prisma.contactPoint.findUnique({
      where: {
        organizationId_kind_normalizedValue: {
          organizationId,
          kind: ContactPointKind.PHONE,
          normalizedValue,
        },
      },
      select: { prospectId: true, clientId: true },
    });
  }
}
