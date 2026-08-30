import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

describe('AuthController refresh cookie deployment policy', () => {
  it.each([
    ['staging HTTP', 'false', false],
    ['production HTTPS', 'true', true],
  ])('sets the expected Secure flag for %s', async (_label, value, secure) => {
    const authService = {
      validateUser: jest.fn().mockResolvedValue({ id: 'user-1' }),
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshExpiresAt: new Date('2026-09-06T00:00:00.000Z'),
        user: { id: 'user-1' },
      }),
    };
    const configService = {
      get: jest.fn((name: string) => {
        if (name === 'COOKIE_SECURE') return value;
        if (name === 'NODE_ENV') return 'production';
        return undefined;
      }),
    };
    const response = { cookie: jest.fn() };
    const request = { ip: '203.0.113.20', get: jest.fn(() => 'test-agent') };
    const controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );

    await controller.login(
      { email: 'admin@example.com', password: 'test-password' },
      request as never,
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'auto_import_refresh',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });
});
