import { dossierCreatedRange } from './zoned-date-range.helper';

describe('dossierCreatedRange', () => {
  const now = new Date('2026-09-05T22:30:00.000Z');

  it('uses local Algeria midnight for today', () => {
    const range = dossierCreatedRange(
      'today',
      'Africa/Algiers',
      undefined,
      undefined,
      now,
    );
    expect(range.from.toISOString()).toBe('2026-09-04T23:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-09-05T23:00:00.000Z');
  });

  it('uses Monday as the first day of the week', () => {
    const range = dossierCreatedRange(
      'week',
      'Africa/Algiers',
      undefined,
      undefined,
      now,
    );
    expect(range.from.toISOString()).toBe('2026-08-30T23:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-09-06T23:00:00.000Z');
  });

  it('makes the custom end date inclusive through an exclusive boundary', () => {
    const range = dossierCreatedRange(
      'custom',
      'Africa/Algiers',
      '2026-09-01',
      '2026-09-05',
      now,
    );
    expect(range.from.toISOString()).toBe('2026-08-31T23:00:00.000Z');
    expect(range.toExclusive.toISOString()).toBe('2026-09-05T23:00:00.000Z');
  });
});
