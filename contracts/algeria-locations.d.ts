export type AlgerianWilaya = {
  readonly code: string;
  readonly name: string;
  readonly communes: readonly string[];
};

export const ALGERIA_WILAYAS: readonly AlgerianWilaya[];
export function findAlgerianWilaya(value?: string | null): AlgerianWilaya | null;
export function isValidAlgerianCommune(
  wilayaValue?: string | null,
  communeValue?: string | null,
): boolean;
