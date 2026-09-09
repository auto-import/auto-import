import { ShipmentContainerType } from '@prisma/client';

export const CONTAINER_TYPES = [
  {
    code: ShipmentContainerType.THREE_VEHICLES,
    label: '3 véhicules',
    capacity: 3,
  },
  {
    code: ShipmentContainerType.FOUR_VEHICLES,
    label: '4 véhicules',
    capacity: 4,
  },
] as const;

export function containerCapacity(type?: ShipmentContainerType | null) {
  return CONTAINER_TYPES.find((item) => item.code === type)?.capacity ?? null;
}
