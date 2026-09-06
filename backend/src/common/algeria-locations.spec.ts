import {
  ALGERIA_WILAYAS,
  findAlgerianWilaya,
  isValidAlgerianCommune,
} from '@auto-import/contracts';

describe('Algerian location reference', () => {
  it('contains the current 69 wilayas and 1,541 communes', () => {
    expect(ALGERIA_WILAYAS).toHaveLength(69);
    expect(
      ALGERIA_WILAYAS.reduce(
        (total, wilaya) => total + wilaya.communes.length,
        0,
      ),
    ).toBe(1541);
  });

  it('validates commune membership and supports padded wilaya codes', () => {
    expect(findAlgerianWilaya('16')?.name).toBe('Alger');
    expect(isValidAlgerianCommune('31', 'Bir El Djir')).toBe(true);
    expect(isValidAlgerianCommune('31', 'Alger Centre')).toBe(false);
  });
});
