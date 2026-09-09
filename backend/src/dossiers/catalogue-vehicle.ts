import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Source = Prisma.ChinaOfferVehicleGetPayload<{
  include: { offer: true };
}>;

/** One operational vehicle per reserved unit; catalogue lines can contain many units. */
export async function reserveCatalogueVehicle(
  tx: Prisma.TransactionClient,
  organizationId: string,
  source: Source,
) {
  const existing = await tx.vehicle.findFirst({
    where: {
      organizationId,
      ...(source.vin
        ? { vin: source.vin }
        : {
            sourceOfferVehicleId: source.id,
            status: 'available',
            archivedAt: null,
          }),
    },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    if (
      existing.archivedAt ||
      existing.status !== 'available' ||
      (existing.sourceOfferVehicleId &&
        existing.sourceOfferVehicleId !== source.id) ||
      (await tx.dossierVehicle.findFirst({
        where: {
          vehicleId: existing.id,
          dossier: {
            archivedAt: null,
            status: { notIn: ['closed', 'serviceCompleted', 'cancelled'] },
          },
        },
      }))
    )
      throw new ConflictException(
        'Ce véhicule est déjà affecté ou indisponible. Rechargez le catalogue.',
      );
    await tx.vehicle.update({
      where: { id: existing.id },
      data: { sourceOfferVehicleId: source.id },
    });
    return existing.id;
  }
  if (
    source.vin &&
    (await tx.vehicle.findUnique({
      where: { vin: source.vin },
      select: { id: true },
    }))
  ) {
    throw new ConflictException('Ce VIN n’est pas disponible pour ce dossier.');
  }
  const spec = source.specification as Record<string, unknown> | null;
  const string = (key: string) =>
    typeof spec?.[key] === 'string' ? (spec[key] as string) : undefined;
  const vehicle = await tx.vehicle.create({
    data: {
      organizationId,
      sourceOfferVehicleId: source.id,
      vin: source.vin,
      brand: source.brand,
      model: source.model,
      trim: source.version,
      year: source.year,
      mileage: source.mileage,
      condition: source.condition,
      brandLookupId: source.brandLookupId,
      modelLookupId: source.modelLookupId,
      versionLookupId: source.versionLookupId,
      currency: source.currency,
      acquisitionType: 'chinaOffer',
      supplierId: source.offer.supplierId,
      status: 'available',
      specs: {
        create: {
          engine: string('engine'),
          fuelType: string('fuelType'),
          transmission: string('transmission'),
          color: string('color'),
          description: string('description'),
        },
      },
    },
  });
  const photos = await tx.offerPhoto.findMany({
    where: { offerId: source.offerId },
  });
  if (photos.length)
    await tx.vehiclePhoto.createMany({
      data: photos.map((photo) => ({
        vehicleId: vehicle.id,
        fileId: photo.fileId,
        sortOrder: photo.sortOrder,
        isPrimary: photo.isPrimary,
      })),
    });
  return vehicle.id;
}
