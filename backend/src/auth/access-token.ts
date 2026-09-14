import { UnauthorizedException } from '@nestjs/common';

export interface AccessTokenPayload {
  sub: string;
  purpose?: string;
  authVersion?: number;
}

/** Legacy access tokens have no purpose/version. A pre-2FA token never grants access. */
export function assertAccessToken(payload: AccessTokenPayload) {
  if (
    !payload.sub ||
    (payload.purpose !== undefined && payload.purpose !== 'access') ||
    (payload.authVersion !== undefined &&
      (!Number.isSafeInteger(payload.authVersion) || payload.authVersion < 0))
  ) {
    throw new UnauthorizedException('Invalid access token');
  }
}
