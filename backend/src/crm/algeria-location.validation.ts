import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CrmReferenceKind,
  findAlgerianWilaya,
  isValidAlgerianCommune,
} from '@auto-import/contracts';

type LocationInput = {
  countryId?: string | null;
  wilaya?: string | null;
  city?: string | null;
};

export async function normalizeAndValidateCrmLocation(
  tx: Prisma.TransactionClient,
  organizationId: string,
  input: LocationInput,
) {
  if (!input.countryId) {
    return {
      wilaya: input.wilaya?.trim() || null,
      city: input.city?.trim() || null,
    };
  }
  const country = await tx.crmReferenceValue.findFirst({
    where: {
      id: input.countryId,
      organizationId,
      kind: CrmReferenceKind.COUNTRY,
      active: true,
    },
    select: { code: true, labelFr: true },
  });
  if (!country) {
    throw new BadRequestException('Le pays sélectionné est invalide.');
  }
  const isAlgeria =
    ['DZ', 'DZA', 'ALGERIE', 'ALGÉRIE'].includes(country.code.toUpperCase()) ||
    country.labelFr.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() ===
      'ALGERIE';
  if (!isAlgeria) {
    return {
      wilaya: input.wilaya?.trim() || null,
      city: input.city?.trim() || null,
    };
  }
  if (!input.wilaya && !input.city) return { wilaya: null, city: null };
  const wilaya = findAlgerianWilaya(input.wilaya);
  if (!wilaya) {
    throw new BadRequestException('La wilaya sélectionnée est invalide.');
  }
  if (!input.city || !isValidAlgerianCommune(wilaya.name, input.city)) {
    throw new BadRequestException(
      'La commune sélectionnée ne correspond pas à la wilaya.',
    );
  }
  const city =
    wilaya.communes.find(
      (candidate) =>
        candidate.localeCompare(input.city!, 'fr', { sensitivity: 'base' }) === 0,
    ) ?? input.city;
  return { wilaya: wilaya.name, city };
}
