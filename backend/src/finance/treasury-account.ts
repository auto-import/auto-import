import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export async function requireTreasuryAccount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  currency: string,
  id?: string,
  officeId?: string,
) {
  if (!id)
    throw new BadRequestException(
      'Sélectionnez le compte de trésorerie du paiement.',
    );
  const account = await tx.treasuryAccount.findFirst({
    where: {
      id,
      organizationId,
      currency: currency.toUpperCase(),
      status: 'ACTIVE',
      archivedAt: null,
    },
    include: { office: true },
  });
  if (!account)
    throw new BadRequestException(
      'Compte de trésorerie actif introuvable dans cette devise.',
    );
  if (
    !account.office ||
    account.office.organizationId !== organizationId ||
    account.office.status !== 'active'
  )
    throw new BadRequestException(
      'Rattachez ce compte à un Bureau actif avant de l’utiliser.',
    );
  if (officeId && account.officeId !== officeId)
    throw new BadRequestException(
      'Le compte de trésorerie ne correspond pas au Bureau sélectionné.',
    );
  return account;
}
