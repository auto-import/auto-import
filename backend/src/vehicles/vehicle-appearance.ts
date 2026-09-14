import { VehicleColor } from '@prisma/client';

export const VEHICLE_COLOR_LABELS: Record<VehicleColor, string> = {
  BLACK: 'Noir',
  WHITE: 'Blanc',
  GRAY: 'Gris',
  SILVER: 'Argent',
  BLUE: 'Bleu',
  RED: 'Rouge',
  GREEN: 'Vert',
  BROWN: 'Marron',
  BEIGE: 'Beige',
  GOLD: 'Or',
  ORANGE: 'Orange',
  YELLOW: 'Jaune',
  PURPLE: 'Violet',
  OTHER: 'Autre',
};

const aliases: Record<string, VehicleColor> = {
  noir: 'BLACK',
  noire: 'BLACK',
  black: 'BLACK',
  blanc: 'WHITE',
  blanche: 'WHITE',
  white: 'WHITE',
  gris: 'GRAY',
  grise: 'GRAY',
  gray: 'GRAY',
  grey: 'GRAY',
  argent: 'SILVER',
  argente: 'SILVER',
  argentee: 'SILVER',
  silver: 'SILVER',
  bleu: 'BLUE',
  bleue: 'BLUE',
  blue: 'BLUE',
  rouge: 'RED',
  red: 'RED',
  vert: 'GREEN',
  verte: 'GREEN',
  green: 'GREEN',
  marron: 'BROWN',
  brun: 'BROWN',
  brune: 'BROWN',
  brown: 'BROWN',
  beige: 'BEIGE',
  or: 'GOLD',
  dore: 'GOLD',
  doree: 'GOLD',
  gold: 'GOLD',
  golden: 'GOLD',
  orange: 'ORANGE',
  jaune: 'YELLOW',
  yellow: 'YELLOW',
  violet: 'PURPLE',
  violette: 'PURPLE',
  purple: 'PURPLE',
  autre: 'OTHER',
  other: 'OTHER',
};

/** Keep legacy free text intact; only its structured classification is normalized. */
export function normalizeVehicleColor(value: unknown): VehicleColor | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return aliases[normalized] ?? VehicleColor.OTHER;
}
