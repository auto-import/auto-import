import { ContactResolutionService } from './contact-resolution.service';

describe('ContactResolutionService', () => {
  const service = new ContactResolutionService({} as never);

  it.each([
    ['0550 12 34 56', '+213550123456'],
    ['213550123456', '+213550123456'],
    ['00213 550 123 456', '+213550123456'],
    ['+33 6 12 34 56 78', '+33612345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(service.normalizePhone(input)).toBe(expected);
  });

  it('normalizes email identity case and whitespace', () => {
    expect(service.normalizeEmail('  Agent@Example.COM ')).toBe(
      'agent@example.com',
    );
  });
});
