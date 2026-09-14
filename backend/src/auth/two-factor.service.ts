import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserTwoFactor } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { toDataURL } from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { SensitiveFieldService } from '../common/security/sensitive-field.service';
import type { AuthenticatedUser, SessionMetadata } from './auth.types';

type Account = Prisma.UserGetPayload<{ include: { organization: true } }>;
type Failure = { failure: HttpException };
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  expiresAt: Date;
}
const clearedAttempts = { failedAttempts: 0, lockedUntil: null };
const audience = 'corapide:two-factor';

@Injectable()
export class TwoFactorService {
  private readonly cipher = new SensitiveFieldService();
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async withUserLock<T>(
    userId: string,
    work: (tx: Prisma.TransactionClient, user: Account) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { organization: true },
      });
      if (
        !user ||
        user.status !== 'active' ||
        user.organization.status !== 'active'
      ) {
        throw new UnauthorizedException('Compte ou organisation inactif.');
      }
      return work(tx, user);
    });
  }

  private unwrap<T>(value: T | Failure): T {
    if (value && typeof value === 'object' && 'failure' in value)
      throw value.failure;
    return value as T;
  }

  private assertUnlocked(state: UserTwoFactor) {
    if (state.lockedUntil && state.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        {
          code: 'TWO_FACTOR_RATE_LIMITED',
          message: 'Trop de tentatives. Réessayez dans quinze minutes.',
        },
        429,
      );
    }
  }

  private async failed(
    tx: Prisma.TransactionClient,
    state: UserTwoFactor,
  ): Promise<Failure> {
    const count =
      state.lockedUntil && state.lockedUntil.getTime() <= Date.now()
        ? 1
        : state.failedAttempts + 1;
    await tx.userTwoFactor.update({
      where: { userId: state.userId },
      data: {
        failedAttempts: count,
        lockedUntil: count >= 5 ? new Date(Date.now() + 15 * 60_000) : null,
      },
    });
    // Returned, not thrown here: persist failed attempts before responding.
    return {
      failure:
        count >= 5
          ? new HttpException(
              {
                code: 'TWO_FACTOR_RATE_LIMITED',
                message: 'Trop de tentatives. Réessayez dans quinze minutes.',
              },
              429,
            )
          : new UnauthorizedException({
              code: 'TWO_FACTOR_INVALID',
              message: 'Vérification incorrecte, expirée ou déjà utilisée.',
            }),
    };
  }

  private state(tx: Prisma.TransactionClient, userId: string) {
    return tx.userTwoFactor.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
  private recoveryHash(userId: string, code: string) {
    return this.hash(`${userId}\0${code.replace(/-/g, '').toUpperCase()}`);
  }
  private decrypt(ciphertext: string, userId: string) {
    try {
      return this.cipher.decrypt(ciphertext, 'totp', userId);
    } catch {
      throw new ServiceUnavailableException(
        'La vérification 2FA est temporairement indisponible. Contactez un administrateur.',
      );
    }
  }

  private async factor(
    tx: Prisma.TransactionClient,
    state: UserTwoFactor,
    code: string,
    setup = false,
  ): Promise<boolean> {
    const encrypted = setup ? state.pendingCiphertext : state.secretCiphertext;
    if (/^\d{6}$/.test(code) && encrypted) {
      const result = verifySync({
        secret: this.decrypt(encrypted, state.userId),
        token: code,
        algorithm: 'sha1',
        digits: 6,
        period: 30,
        epochTolerance: 30,
        ...(state.lastUsedStep !== null
          ? { afterTimeStep: state.lastUsedStep }
          : {}),
      });
      if (result.valid && 'timeStep' in result) {
        await tx.userTwoFactor.update({
          where: { userId: state.userId },
          data: { lastUsedStep: result.timeStep },
        });
        return true;
      }
    } else if (
      !setup &&
      /^(?:[a-fA-F0-9]{32}|(?:[a-fA-F0-9]{8}-){3}[a-fA-F0-9]{8})$/.test(code)
    ) {
      const hash = this.recoveryHash(state.userId, code);
      const found = state.recoveryHashes.find(
        (stored) =>
          stored.length === hash.length &&
          timingSafeEqual(Buffer.from(stored), Buffer.from(hash)),
      );
      if (found) {
        await tx.userTwoFactor.update({
          where: { userId: state.userId },
          data: {
            recoveryHashes: state.recoveryHashes.filter((h) => h !== found),
          },
        });
        return true;
      }
    }
    return false;
  }

  private audit(
    tx: Prisma.TransactionClient,
    user: Account,
    action: string,
    metadata: SessionMetadata,
    extra: Prisma.InputJsonObject = {},
    actorId = user.id,
  ) {
    return tx.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: actorId,
        action: `account.twofactor.${action}`,
        entityType: 'User',
        entityId: user.id,
        newValues: extra,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
  }

  async status(userId: string) {
    const state = await this.prisma.userTwoFactor.findUnique({
      where: { userId },
      select: { enabledAt: true, recoveryHashes: true },
    });
    return {
      enabled: Boolean(state?.enabledAt),
      enabledAt: state?.enabledAt ?? null,
      recoveryCodesRemaining: state?.recoveryHashes.length ?? 0,
    };
  }

  async startSetup(
    userId: string,
    password: string,
    metadata: SessionMetadata,
  ) {
    return this.unwrap(
      await this.withUserLock(userId, async (tx, user) => {
        const state = await this.state(tx, userId);
        this.assertUnlocked(state);
        if (state.enabledAt)
          throw new ConflictException('La 2FA est déjà activée.');
        if (!(await bcrypt.compare(password, user.passwordHash)))
          return this.failed(tx, state);
        const secret = generateSecret({ length: 20 });
        const encrypted = this.cipher.encrypt(secret, 'totp', userId);
        const provisioningUri = generateURI({
          issuer: 'Corapide',
          label: user.email,
          secret,
          algorithm: 'sha1',
          digits: 6,
          period: 30,
        });
        const qrCodeDataUrl = await toDataURL(provisioningUri, {
          width: 280,
          errorCorrectionLevel: 'M',
        });
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        await tx.userTwoFactor.update({
          where: { userId },
          data: {
            pendingCiphertext: encrypted,
            pendingExpiresAt: expiresAt,
            lastUsedStep: null,
          },
        });
        await this.audit(tx, user, 'setup.started', metadata);
        return { secret, provisioningUri, qrCodeDataUrl, expiresAt };
      }),
    );
  }

  async confirmSetup(userId: string, code: string, metadata: SessionMetadata) {
    return this.unwrap(
      await this.withUserLock(userId, async (tx, user) => {
        const state = await this.state(tx, userId);
        this.assertUnlocked(state);
        if (
          state.enabledAt ||
          !state.pendingCiphertext ||
          !state.pendingExpiresAt ||
          state.pendingExpiresAt.getTime() <= Date.now()
        ) {
          throw new ConflictException(
            'La configuration a expiré ou est déjà validée. Recommencez si nécessaire.',
          );
        }
        if (!(await this.factor(tx, state, code, true)))
          return this.failed(tx, state);
        const recoveryCodes = Array.from({ length: 10 }, () =>
          randomBytes(16)
            .toString('hex')
            .toUpperCase()
            .match(/.{8}/g)!
            .join('-'),
        );
        await tx.userTwoFactor.update({
          where: { userId },
          data: {
            secretCiphertext: state.pendingCiphertext,
            pendingCiphertext: null,
            pendingExpiresAt: null,
            enabledAt: new Date(),
            recoveryHashes: recoveryCodes.map((c) =>
              this.recoveryHash(userId, c),
            ),
            challengeHash: null,
            challengeExpiresAt: null,
            sessionVersion: { increment: 1 },
            ...clearedAttempts,
          },
        });
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit(tx, user, 'enabled', metadata, {
          recoveryCodesGenerated: 10,
          sessionsRevoked: true,
        });
        return { enabled: true, recoveryCodes, reauthenticationRequired: true };
      }),
    );
  }

  async challenge(
    tx: Prisma.TransactionClient,
    user: Account,
    metadata: SessionMetadata,
  ): Promise<TwoFactorChallenge | null> {
    const state = await tx.userTwoFactor.findUnique({
      where: { userId: user.id },
    });
    if (!state?.enabledAt) return null;
    this.assertUnlocked(state);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const challengeToken = this.jwt.sign(
      {
        sub: user.id,
        purpose: 'two-factor',
        jti: randomBytes(32).toString('base64url'),
      },
      { expiresIn: '5m', audience },
    );
    await tx.userTwoFactor.update({
      where: { userId: user.id },
      data: {
        challengeHash: this.hash(`${challengeToken}\0${user.passwordHash}`),
        challengeExpiresAt: expiresAt,
      },
    });
    await this.audit(tx, user, 'challenge.created', metadata);
    return { twoFactorRequired: true, challengeToken, expiresAt };
  }

  async completeLogin<T>(
    challengeToken: string,
    code: string,
    metadata: SessionMetadata,
    issueSession: (tx: Prisma.TransactionClient, userId: string) => Promise<T>,
  ): Promise<T> {
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwt.verify(challengeToken, {
        audience,
        algorithms: ['HS256'],
      });
      if (payload.purpose !== 'two-factor' || typeof payload.sub !== 'string')
        throw new Error();
    } catch {
      throw new UnauthorizedException({
        code: 'TWO_FACTOR_CHALLENGE_EXPIRED',
        message: 'Connexion expirée. Saisissez à nouveau votre mot de passe.',
      });
    }
    return this.unwrap(
      await this.withUserLock(payload.sub, async (tx, user) => {
        const state = await tx.userTwoFactor.findUnique({
          where: { userId: user.id },
        });
        if (
          !state?.enabledAt ||
          !state.challengeExpiresAt ||
          state.challengeExpiresAt.getTime() <= Date.now() ||
          state.challengeHash !==
            this.hash(`${challengeToken}\0${user.passwordHash}`)
        ) {
          throw new UnauthorizedException({
            code: 'TWO_FACTOR_CHALLENGE_EXPIRED',
            message:
              'Connexion expirée ou déjà utilisée. Recommencez la connexion.',
          });
        }
        this.assertUnlocked(state);
        if (!(await this.factor(tx, state, code)))
          return this.failed(tx, state);
        await tx.userTwoFactor.update({
          where: { userId: user.id },
          data: {
            challengeHash: null,
            challengeExpiresAt: null,
            ...clearedAttempts,
          },
        });
        await this.audit(tx, user, 'login.verified', metadata, {
          method: /^\d{6}$/.test(code) ? 'TOTP' : 'RECOVERY',
        });
        return issueSession(tx, user.id);
      }),
    );
  }

  private async clear(tx: Prisma.TransactionClient, userId: string) {
    await tx.userTwoFactor.update({
      where: { userId },
      data: {
        secretCiphertext: null,
        pendingCiphertext: null,
        pendingExpiresAt: null,
        enabledAt: null,
        recoveryHashes: [],
        lastUsedStep: null,
        challengeHash: null,
        challengeExpiresAt: null,
        sessionVersion: { increment: 1 },
        ...clearedAttempts,
      },
    });
    await tx.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    metadata: SessionMetadata,
  ) {
    return this.unwrap(
      await this.withUserLock(userId, async (tx, user) => {
        const state = await this.state(tx, userId);
        this.assertUnlocked(state);
        if (!state.enabledAt)
          throw new ConflictException('La 2FA est déjà désactivée.');
        if (
          !(await bcrypt.compare(password, user.passwordHash)) ||
          !(await this.factor(tx, state, code))
        )
          return this.failed(tx, state);
        await this.clear(tx, userId);
        await this.audit(tx, user, 'disabled', metadata, {
          sessionsRevoked: true,
        });
        return { enabled: false, reauthenticationRequired: true };
      }),
    );
  }

  async adminReset(
    targetId: string,
    actor: AuthenticatedUser,
    password: string,
    code: string | undefined,
    reason: string,
    metadata: SessionMetadata,
  ) {
    if (targetId === actor.id)
      throw new ForbiddenException(
        'Utilisez la désactivation 2FA dans votre profil.',
      );
    return this.unwrap(
      await this.prisma.$transaction(async (tx) => {
        for (const id of [actor.id, targetId].sort()) {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
        }
        const target = await tx.user.findFirst({
          where: { id: targetId, organizationId: actor.organizationId },
          include: { organization: true },
        });
        if (!target) throw new NotFoundException('Utilisateur introuvable.');
        const admin = await tx.user.findUnique({
          where: { id: actor.id },
          include: {
            organization: true,
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: { include: { permission: true } },
                  },
                },
              },
            },
          },
        });
        if (
          !admin ||
          admin.organizationId !== actor.organizationId ||
          admin.status !== 'active' ||
          admin.organization.status !== 'active' ||
          !admin.userRoles.some(({ role }) =>
            role.rolePermissions.some(
              ({ permission }) =>
                permission.resource === 'users' &&
                permission.action === 'manage',
            ),
          )
        ) {
          throw new ForbiddenException('Autorisation insuffisante.');
        }
        const state = await this.state(tx, actor.id);
        this.assertUnlocked(state);
        if (
          !(await bcrypt.compare(password, admin.passwordHash)) ||
          (state.enabledAt && !(await this.factor(tx, state, code ?? '')))
        )
          return this.failed(tx, state);
        const targetState = await tx.userTwoFactor.findUnique({
          where: { userId: targetId },
        });
        if (!targetState?.enabledAt && !targetState?.pendingCiphertext)
          throw new ConflictException(
            'Aucune configuration 2FA à réinitialiser.',
          );
        await this.clear(tx, targetId);
        await tx.userTwoFactor.update({
          where: { userId: actor.id },
          data: clearedAttempts,
        });
        await this.audit(
          tx,
          target,
          'admin.reset',
          metadata,
          { reason: reason.trim(), sessionsRevoked: true },
          actor.id,
        );
        return { enabled: false, reauthenticationRequired: true };
      }),
    );
  }
}
