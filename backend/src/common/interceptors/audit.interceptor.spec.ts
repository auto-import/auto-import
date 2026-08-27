import { safeChangedFields } from './audit.interceptor';

describe('Audit redaction', () => {
  it('never includes secret, authentication or private-file fields', () => {
    expect(
      safeChangedFields({
        title: 'Contrat signé',
        status: 'valid',
        password: 'never-log',
        passwordHash: 'never-log',
        accessToken: 'never-log',
        refresh_token: 'never-log',
        authorization: 'never-log',
        cookie: 'never-log',
        file: Buffer.from('private'),
        apiKey: 'never-log',
      }),
    ).toEqual(['status', 'title']);
  });
});
