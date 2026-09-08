export const SUPPLIER_REFERENCE_KINDS = ['COUNTRY', 'CURRENCY'] as const;

export type SupplierReferenceKind = (typeof SUPPLIER_REFERENCE_KINDS)[number];

export const DEFAULT_SUPPLIER_REFERENCES: ReadonlyArray<{
  kind: SupplierReferenceKind;
  value: string;
}> = [
  { kind: 'COUNTRY', value: 'Algérie' },
  { kind: 'COUNTRY', value: 'Chine' },
  { kind: 'CURRENCY', value: 'USD' },
  { kind: 'CURRENCY', value: 'CNY' },
  { kind: 'CURRENCY', value: 'DZD' },
];

export function normalizeReferenceValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

export function normalizeVehicleLookupValue(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase('fr');
}

export function supplierReferenceCode(
  kind: SupplierReferenceKind,
  value: string,
) {
  const normalized = normalizeReferenceValue(value);
  const suffix = normalized
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `SUPPLIER_${kind}_${suffix}`;
}

export function supplierReferenceDbKind(kind: SupplierReferenceKind) {
  return `SUPPLIER_${kind}`;
}
