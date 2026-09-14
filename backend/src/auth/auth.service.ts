import { TwoFactorService } from './two-factor.service';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
  twoFactor: { select: { sessionVersion: true } },
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
    private readonly twoFactor: TwoFactorService,
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

    return user;
  }

  async login(user: AuthUserRecord, metadata: SessionMetadata = {}) {
    return this.twoFactor.withUserLock(user.id, async (tx, lockedUser) => {
      if (lockedUser.passwordHash !== user.passwordHash)
        throw new UnauthorizedException('Invalid credentials');
      const challenge = await this.twoFactor.challenge(
        tx,
        lockedUser,
        metadata,
      );
      if (challenge) return challenge;
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: AUTH_USER_INCLUDE,
      });
      return this.issueSession(tx, fresh, metadata);
    });
  }

  async completeTwoFactor(
    challengeToken: string,
    code: string,
    metadata: SessionMetadata,
  ) {
    return this.twoFactor.completeLogin(
      challengeToken,
      code,
      metadata,
      async (tx, userId) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: AUTH_USER_INCLUDE,
        });
        this.assertActiveAccount(user);
        return this.issueSession(tx, user, metadata);
      },
    );
  }

  private async issueSession(
    tx: Prisma.TransactionClient,
    user: AuthUserRecord,
    metadata: SessionMetadata,
  ) {
    const principal = this.toAuthenticatedUser(user);
    const refreshToken = this.createRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshSessionTtlMs);
    await tx.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      accessToken: this.createAccessToken(
        principal,
        user.twoFactor?.sessionVersion ?? 0,
      ),
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
          accessToken: this.createAccessToken(
            user,
            session.user.twoFactor?.sessionVersion ?? 0,
          ),
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

  async getCurrentUser(
    userId: string,
    authVersion = 0,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: AUTH_USER_INCLUDE,
    });
    if (!user) throw new UnauthorizedException('Invalid session');
    if ((user.twoFactor?.sessionVersion ?? 0) !== authVersion)
      throw new UnauthorizedException('Invalid session');
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
      const revoked = await tx.refreshSession.updateMany({
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
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId,
          action: 'account.password.changed',
          entityType: 'User',
          entityId: userId,
          newValues: {
            passwordChanged: true,
            activeSessionsRevoked: revoked.count,
          },
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    });
    this.passwordAttempts.delete(userId);
    const principal = this.toAuthenticatedUser(user);
    return {
      accessToken: this.createAccessToken(
        principal,
        user.twoFactor?.sessionVersion ?? 0,
      ),
      refreshToken: nextRefreshToken,
      refreshExpiresAt,
      user: principal,
      sessionBehavior: 'current_rotated_other_sessions_revoked' as const,
    };
  }

  async changeOwnEmail(
    userId: string,
    currentPassword: string,
    newEmailInput: string,
    confirmationInput: string,
    refreshToken: string | undefined,
    metadata: SessionMetadata,
  ) {
    const newEmail = newEmailInput.trim().toLowerCase();
    const confirmation = confirmationInput.trim().toLowerCase();
    if (newEmail !== confirmation) {
      throw new UnauthorizedException('Email change unavailable');
    }
    if (!refreshToken) throw new UnauthorizedException('Invalid session');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: AUTH_USER_INCLUDE,
    });
    if (
      !user ||
      newEmail === user.email.trim().toLowerCase() ||
      !(await bcrypt.compare(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Email change unavailable');
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
    const nextRefreshToken = this.createRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshSessionTtlMs);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const nextUser = await tx.user.update({
          where: { id: userId },
          data: { email: newEmail },
          include: AUTH_USER_INCLUDE,
        });
        const revoked = await tx.refreshSession.updateMany({
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
        await tx.auditLog.create({
          data: {
            organizationId: user.organizationId,
            userId,
            action: 'account.email.changed',
            entityType: 'User',
            entityId: userId,
            oldValues: { email: user.email.trim().toLowerCase() },
            newValues: {
              email: newEmail,
              activeSessionsRevoked: revoked.count,
            },
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent,
          },
        });
        return nextUser;
      });
      const principal = this.toAuthenticatedUser(updated);
      return {
        accessToken: this.createAccessToken(
          principal,
          user.twoFactor?.sessionVersion ?? 0,
        ),
        refreshToken: nextRefreshToken,
        refreshExpiresAt,
        user: principal,
        sessionBehavior: 'current_rotated_other_sessions_revoked' as const,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already in use');
      }
      throw error;
    }
  }

  get refreshSessionTtlMs(): number {
    const configured = this.configService.get<string>('JWT_REFRESH_TTL', '7d');
    const match = /^(\d+)(s|m|h|d)$/.exec(configured);
    if (!match) throw new Error('JWT_REFRESH_TTL must use s, m, h, or d');
    const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return Number(match[1]) * units[match[2] as keyof typeof units];
  }

  private createAccessToken(user: AuthenticatedUser, authVersion = 0): string {
    return this.jwtService.sign({
      sub: user.id,
      purpose: 'access',
      authVersion,
      email: user.email,
      organizationId: user.organizationId,
      locale: user.locale === 'en' ? 'en' : 'fr',
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
      locale: user.locale === 'en' ? 'en' : 'fr',
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
