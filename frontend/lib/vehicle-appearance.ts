export const VEHICLE_COLOR_LABELS = {
  BLACK: "Noir",
  WHITE: "Blanc",
  GRAY: "Gris",
  SILVER: "Argent",
  BLUE: "Bleu",
  RED: "Rouge",
  GREEN: "Vert",
  BROWN: "Marron",
  BEIGE: "Beige",
  GOLD: "Or",
  ORANGE: "Orange",
  YELLOW: "Jaune",
  PURPLE: "Violet",
  OTHER: "Autre",
} as const;
export type VehicleColor = keyof typeof VEHICLE_COLOR_LABELS;

export const VEHICLE_PAINT_CONDITION_LABELS = {
  ORIGINAL: "Original / Jamais touché",
  TOUCHED_UP: "Retouché",
  PARTIALLY_REPAINTED: "Partiellement repeint",
  MULTIPLE_PANELS_REPAINTED: "Plusieurs parties repeintes",
  FULLY_REPAINTED: "Entièrement repeint",
  ACCIDENT_REPAINTED: "Repeint suite à accident",
  SCRATCHED: "Rayé",
  DAMAGED: "Endommagé",
  UNKNOWN: "Inconnu",
} as const;
export type VehiclePaintCondition = keyof typeof VEHICLE_PAINT_CONDITION_LABELS;
