import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Permission as PermissionValue } from '@auto-import/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser, SessionMetadata } from './auth.types';

const AUTH_USER_INCLUDE = {
  organization: true,
  office: { select: { id: true, name: true } },
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: { include: { permission: true } },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type AuthUserRecord = Prisma.UserGetPayload<{
  include: typeof AUTH_USER_INCLUDE;
}>;

@Injectable()
export class AuthService {
  private readonly passwordAttempts = new Map<string, number[]>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: AUTH_USER_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.assertActiveAccount(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async login(user: AuthUserRecord, metadata: SessionMetadata = {}) {
    const principal = this.toAuthenticatedUser(user);
    const refreshToken = this.createRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshSessionTtlMs);

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    return {
      accessToken: this.createAccessToken(principal),
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: principal,
    };
  }

  async refreshToken(
    refreshToken: string | undefined,
    metadata: SessionMetadata,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid session');
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const session = await transaction.refreshSession.findUnique({
          where: { tokenHash: this.hashRefreshToken(refreshToken) },
          include: { user: { include: AUTH_USER_INCLUDE } },
        });

        if (
          !session ||
          session.revokedAt ||
          session.expiresAt.getTime() <= Date.now()
        ) {
          throw new UnauthorizedException('Invalid session');
        }

        this.assertActiveAccount(session.user);

        const revoked = await transaction.refreshSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date(), rotatedAt: new Date() },
        });
        if (revoked.count !== 1) {
          throw new UnauthorizedException('Invalid session');
        }

        const nextRefreshToken = this.createRefreshToken();
        const refreshExpiresAt = new Date(
          Date.now() + this.refreshSessionTtlMs,
        );
        await transaction.refreshSession.create({
          data: {
            userId: session.user.id,
            tokenHash: this.hashRefreshToken(nextRefreshToken),
            expiresAt: refreshExpiresAt,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
        });

        const user = this.toAuthenticatedUser(session.user);
        return {
          accessToken: this.createAccessToken(user),
          refreshToken: nextRefreshToken,
          refreshExpiresAt,
          user,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async hasValidSession(refreshToken: string | undefined): Promise<boolean> {
    if (!refreshToken) return false;
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
      include: { user: { include: { organization: true } } },
    });
    return Boolean(
      session &&
      !session.revokedAt &&
      session.expiresAt.getTime() > Date.now() &&
      session.user.status === 'active' &&
      session.user.organization.status === 'active',
    );
  }

  async getCurrentUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: AUTH_USER_INCLUDE,
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    this.assertActiveAccount(user);
    return this.toAuthenticatedUser(user);
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) {
      await this.prisma.refreshSession.updateMany({
        where: {
          tokenHash: this.hashRefreshToken(refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
    return { message: 'Logged out successfully' };
  }

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmation: string,
    refreshToken: string | undefined,
    metadata: SessionMetadata,
  ) {
    const now = Date.now();
    const attempts = (this.passwordAttempts.get(userId) ?? []).filter(
      (timestamp) => timestamp > now - 15 * 60_000,
    );
    if (attempts.length >= 5) {
      throw new UnauthorizedException('Password change unavailable');
    }
    if (newPassword !== confirmation || newPassword === currentPassword) {
      throw new UnauthorizedException('Password change unavailable');
    }
    if (!refreshToken) throw new UnauthorizedException('Invalid session');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: AUTH_USER_INCLUDE,
    });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      this.passwordAttempts.set(userId, [...attempts, now]);
      throw new UnauthorizedException('Password change unavailable');
    }
    this.assertActiveAccount(user);
    const currentSession = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashRefreshToken(refreshToken) },
    });
    if (
      !currentSession ||
      currentSession.userId !== userId ||
      currentSession.revokedAt
    ) {
      throw new UnauthorizedException('Invalid session');
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const nextRefreshToken = this.createRefreshToken();
    const refreshExpiresAt = new Date(now + this.refreshSessionTtlMs);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), rotatedAt: new Date() },
      });
      await tx.refreshSession.create({
        data: {
          userId,
          tokenHash: this.hashRefreshToken(nextRefreshToken),
          expiresAt: refreshExpiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    });
    this.passwordAttempts.delete(userId);
    const principal = this.toAuthenticatedUser(user);
    return {
      accessToken: this.createAccessToken(principal),
      refreshToken: nextRefreshToken,
      refreshExpiresAt,
      user: principal,
      sessionBehavior: 'current_rotated_other_sessions_revoked' as const,
    };
  }

  get refreshSessionTtlMs(): number {
    const configured = this.configService.get<string>('JWT_REFRESH_TTL', '7d');
    const match = /^(\d+)(s|m|h|d)$/.exec(configured);
    if (!match) throw new Error('JWT_REFRESH_TTL must use s, m, h, or d');
    const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return Number(match[1]) * units[match[2] as keyof typeof units];
  }

  private createAccessToken(user: AuthenticatedUser): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
    });
  }

  private createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private assertActiveAccount(
    user: Pick<AuthUserRecord, 'status' | 'organization'>,
  ): void {
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is inactive');
    }
    if (user.organization.status !== 'active') {
      throw new UnauthorizedException('Organization is inactive');
    }
  }

  private toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
    const permissions = user.userRoles.flatMap(({ role }) =>
      role.rolePermissions.map(
        ({ permission }) =>
          `${permission.resource}:${permission.action}` as PermissionValue,
      ),
    );
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizationId: user.organizationId,
      office: user.office,
      roles: user.userRoles.map(({ role }) => ({
        id: role.id,
        name: role.name,
        scope: role.scope,
      })),
      permissions: [...new Set(permissions)],
    };
  }
}
