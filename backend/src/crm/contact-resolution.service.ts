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
  matchState: 'CREATED' | 'MATCHED' | 'AMBIGUOUS';
  candidateIds?: { prospectIds: string[]; clientIds: string[] };
}

export interface PhoneNormalizationOptions {
  defaultCallingCode?: string;
  nationalLengths?: number[];
}

export function normalizeCanonicalPhone(
  value: string,
  options: PhoneNormalizationOptions = {},
): string {
  const input = value.trim();
  const digits = input.replace(/\D/g, '');
  const callingCode = (options.defaultCallingCode ?? '213').replace(/\D/g, '');
  const nationalLengths = options.nationalLengths ?? [9];
  let international: string;
  if (input.startsWith('+')) international = digits;
  else if (digits.startsWith('00')) international = digits.slice(2);
  else if (digits.startsWith(callingCode)) international = digits;
  else if (digits.startsWith('0'))
    international = `${callingCode}${digits.slice(1)}`;
  else if (nationalLengths.includes(digits.length))
    international = `${callingCode}${digits}`;
  else international = digits;
  if (
    international.length < 8 ||
    international.length > 15 ||
    international.startsWith('0')
  ) {
    throw new BadRequestException({
      code: 'PHONE_INVALID',
      message: 'Phone number must resolve to a valid E.164 number',
    });
  }
  return `+${international}`;
}

@Injectable()
export class ContactResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePhone(value: string): string {
    return normalizeCanonicalPhone(value);
  }

  normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
  }

  async normalizePhoneForCountry(
    tx: Prisma.TransactionClient,
    organizationId: string,
    phone: string,
    countryId?: string | null,
  ) {
    const country = countryId
      ? await tx.crmReferenceValue.findFirst({
          where: {
            id: countryId,
            organizationId,
            kind: 'COUNTRY',
            active: true,
          },
          select: { metadata: true },
        })
      : await tx.crmReferenceValue.findFirst({
          where: {
            organizationId,
            kind: 'COUNTRY',
            active: true,
            metadata: { path: ['defaultForPhone'], equals: true },
          },
          select: { metadata: true },
        });
    const metadata = country?.metadata as {
      callingCode?: string;
      nationalLengths?: number[];
    } | null;
    return normalizeCanonicalPhone(phone, {
      defaultCallingCode: metadata?.callingCode,
      nationalLengths: metadata?.nationalLengths,
    });
  }

  matchPhone(organizationId: string, phone: string) {
    const normalizedValue = this.normalizePhone(phone);
    return this.findPhone(organizationId, normalizedValue).then((match) => ({
      normalizedValue,
      match,
    }));
  }

  matchPhoneInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    phone: string,
  ) {
    const normalizedValue = this.normalizePhone(phone);
    return this.findPhoneInTransaction(
      tx,
      organizationId,
      normalizedValue,
    ).then((match) => ({ normalizedValue, match }));
  }

  matchNormalizedPhoneInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    normalizedValue: string,
  ) {
    return this.findPhoneInTransaction(
      tx,
      organizationId,
      normalizedValue,
    ).then((match) => ({ normalizedValue, match }));
  }

  async resolvePhone(
    organizationId: string,
    phone: string,
    source: 'INBOUND_CALL' | 'WHATSAPP',
    preferredAssigneeId?: string,
  ): Promise<ResolvedContact> {
    const defaultCountry = await this.prisma.crmReferenceValue.findFirst({
      where: {
        organizationId,
        kind: 'COUNTRY',
        active: true,
        metadata: { path: ['defaultForPhone'], equals: true },
      },
      select: { metadata: true },
    });
    const metadata = defaultCountry?.metadata as {
      callingCode?: string;
      nationalLengths?: number[];
    } | null;
    const normalizedValue = normalizeCanonicalPhone(phone, {
      defaultCallingCode: metadata?.callingCode,
      nationalLengths: metadata?.nationalLengths,
    });
    const existing = await this.findPhone(organizationId, normalizedValue);
    if (existing) return { normalizedValue, ...existing, created: false };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const contact = await this.findPhoneInTransaction(
              tx,
              organizationId,
              normalizedValue,
            );
            if (contact) return { normalizedValue, ...contact, created: false };

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
                  where: {
                    organizationId,
                    status: 'active',
                    userRoles: {
                      some: {
                        role: {
                          rolePermissions: {
                            some: {
                              permission: {
                                OR: [
                                  { resource: 'prospects', action: 'write' },
                                  { resource: 'callCenter', action: 'handle' },
                                ],
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  orderBy: { createdAt: 'asc' },
                  select: { id: true },
                });
            if (!assignee) {
              throw new ConflictException(
                'No active employee is available to own the new lead',
              );
            }

            const entryChannel = await tx.crmReferenceValue.findUnique({
              where: {
                organizationId_kind_code: {
                  organizationId,
                  kind: 'ENTRY_CHANNEL',
                  code: source === 'WHATSAPP' ? 'WHATSAPP' : 'INCOMING_CALL',
                },
              },
              select: { id: true },
            });
            const prospect = await tx.prospect.create({
              data: {
                organizationId,
                firstName:
                  source === 'WHATSAPP' ? 'Contact WhatsApp' : 'Appel entrant',
                lastName: normalizedValue.slice(-4),
                phone,
                phoneNormalized: normalizedValue,
                source,
                legacySource: source,
                entryChannelId: entryChannel?.id,
                crmStatus: 'NEW',
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
              matchState: 'CREATED' as const,
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
    normalizedPhone?: string | null,
  ): Promise<void> {
    await this.syncOwnerContacts(
      tx,
      organizationId,
      { prospectId },
      phone,
      email,
      normalizedPhone,
    );
  }

  async syncClientContacts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    clientId: string,
    phone?: string | null,
    email?: string | null,
    normalizedPhone?: string | null,
  ): Promise<void> {
    await this.syncOwnerContacts(
      tx,
      organizationId,
      { clientId },
      phone,
      email,
      normalizedPhone,
    );
  }

  private async syncOwnerContacts(
    tx: Prisma.TransactionClient,
    organizationId: string,
    owner: { prospectId: string } | { clientId: string },
    phone?: string | null,
    email?: string | null,
    normalizedPhone?: string | null,
  ): Promise<void> {
    if (phone !== undefined) {
      await this.replaceOwnerContact(
        tx,
        organizationId,
        owner,
        ContactPointKind.PHONE,
        phone,
        normalizedPhone,
      );
    }
    if (email !== undefined) {
      await this.replaceOwnerContact(
        tx,
        organizationId,
        owner,
        ContactPointKind.EMAIL,
        email,
      );
    }
  }

  private async findPhone(organizationId: string, normalizedValue: string) {
    return this.lookupCandidates(this.prisma, organizationId, normalizedValue);
  }

  private findPhoneInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    normalizedValue: string,
  ) {
    return this.lookupCandidates(tx, organizationId, normalizedValue);
  }

  private async lookupCandidates(
    db: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    normalizedValue: string,
  ) {
    // Keep queries sequential because this helper also receives an interactive
    // transaction backed by one pg client. Parallel client.query calls are
    // deprecated in pg and can obscure the real serialization boundary.
    const contact = await db.contactPoint.findUnique({
      where: {
        organizationId_kind_normalizedValue: {
          organizationId,
          kind: ContactPointKind.PHONE,
          normalizedValue,
        },
      },
      select: { prospectId: true, clientId: true },
    });
    const prospects = await db.prospect.findMany({
      where: {
        organizationId,
        phoneNormalized: normalizedValue,
        archivedAt: null,
      },
      select: { id: true },
      take: 3,
    });
    const clients = await db.client.findMany({
      where: {
        organizationId,
        phoneNormalized: normalizedValue,
        archivedAt: null,
      },
      select: { id: true },
      take: 3,
    });
    const prospectIds = [
      ...new Set([
        ...(contact?.prospectId ? [contact.prospectId] : []),
        ...prospects.map(({ id }) => id),
      ]),
    ];
    const clientIds = [
      ...new Set([
        ...(contact?.clientId ? [contact.clientId] : []),
        ...clients.map(({ id }) => id),
      ]),
    ];
    if (prospectIds.length > 1 || clientIds.length > 1) {
      return {
        prospectId: null,
        clientId: null,
        matchState: 'AMBIGUOUS' as const,
        candidateIds: { prospectIds, clientIds },
      };
    }
    if (!prospectIds.length && !clientIds.length) return null;
    return {
      prospectId: prospectIds[0] ?? null,
      clientId: clientIds[0] ?? null,
      matchState: 'MATCHED' as const,
      candidateIds: { prospectIds, clientIds },
    };
  }

  private async replaceOwnerContact(
    tx: Prisma.TransactionClient,
    organizationId: string,
    owner: { prospectId: string } | { clientId: string },
    kind: ContactPointKind,
    displayValue?: string | null,
    normalizedOverride?: string | null,
  ) {
    const normalizedValue = displayValue
      ? kind === ContactPointKind.PHONE
        ? (normalizedOverride ?? this.normalizePhone(displayValue))
        : this.normalizeEmail(displayValue)
      : null;
    const current = await tx.contactPoint.findMany({
      where: { ...owner, kind },
    });
    for (const item of current) {
      if (item.normalizedValue === normalizedValue) continue;
      const shared = Boolean(item.prospectId && item.clientId);
      if (shared) {
        await tx.contactPoint.update({
          where: { id: item.id },
          data:
            'prospectId' in owner ? { prospectId: null } : { clientId: null },
        });
      } else await tx.contactPoint.delete({ where: { id: item.id } });
    }
    if (!displayValue || !normalizedValue) return;
    const existing = await tx.contactPoint.findUnique({
      where: {
        organizationId_kind_normalizedValue: {
          organizationId,
          kind,
          normalizedValue,
        },
      },
    });
    const alreadyOwned =
      existing &&
      (('prospectId' in owner && existing.prospectId === owner.prospectId) ||
        ('clientId' in owner && existing.clientId === owner.clientId));
    if (existing && !alreadyOwned) {
      throw new ConflictException({
        code:
          kind === ContactPointKind.PHONE
            ? 'PHONE_ALREADY_EXISTS'
            : 'EMAIL_ALREADY_EXISTS',
        message: 'This contact point already belongs to another CRM record',
        matchedRecord: {
          prospectId: existing.prospectId,
          clientId: existing.clientId,
        },
      });
    }
    if (existing) {
      await tx.contactPoint.update({
        where: { id: existing.id },
        data: { displayValue, preferred: true },
      });
    } else {
      await tx.contactPoint.create({
        data: {
          organizationId,
          ...owner,
          kind,
          displayValue,
          normalizedValue,
          whatsappEnabled: kind === ContactPointKind.PHONE,
          preferred: true,
        },
      });
    }
  }
}
