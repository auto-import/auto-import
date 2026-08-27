import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '@prisma/client';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BRANDING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const BRANDING_LOGO_MAX_DIMENSION = 4096;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  async get(user: AuthenticatedUser) {
    const profile = await this.prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        locale: true,
        office: { select: { id: true, name: true, city: true } },
        organization: {
          select: {
            id: true,
            name: true,
            brandingLogo: { select: { updatedAt: true } },
          },
        },
        userRoles: {
          select: { role: { select: { id: true, name: true, scope: true } } },
        },
        avatar: { select: { updatedAt: true } },
      },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return {
      ...profile,
      email: profile.email.trim().toLowerCase(),
      roles: profile.userRoles.map(({ role }) => role),
      userRoles: undefined,
      avatarUrl: profile.avatar
        ? `/profile/avatar?v=${profile.avatar.updatedAt.getTime()}`
        : null,
      branding: {
        companyName: profile.organization.name,
        logoUrl: profile.organization.brandingLogo
          ? `/profile/branding/logo?v=${profile.organization.brandingLogo.updatedAt.getTime()}`
          : null,
      },
    };
  }

  async updateLocale(user: AuthenticatedUser, locale: 'fr' | 'en') {
    await this.prisma.user.updateMany({
      where: { id: user.id, organizationId: user.organizationId },
      data: { locale },
    });
    return this.get(user);
  }

  async updateBranding(user: AuthenticatedUser, companyName: string) {
    const normalized = companyName.trim().replace(/\s+/g, ' ');
    if (normalized.length < 2 || normalized.length > 120) {
      throw new BadRequestException({
        code: 'BRANDING_COMPANY_NAME_INVALID',
        message: 'Company name must contain between 2 and 120 characters',
      });
    }
    const updated = await this.prisma.organization.updateMany({
      where: { id: user.organizationId },
      data: { name: normalized },
    });
    if (updated.count !== 1)
      throw new NotFoundException('Organization not found');
    await this.auditBranding(user, 'branding.name.updated', {
      companyNameChanged: true,
    });
    return this.get(user);
  }

  async uploadBrandingLogo(user: AuthenticatedUser, file: UploadedBufferFile) {
    if (!file?.buffer || file.buffer.length > BRANDING_LOGO_MAX_BYTES) {
      throw new BadRequestException({
        code: 'BRANDING_LOGO_SIZE_INVALID',
        message: 'Company logo is required and must not exceed 2 MB',
      });
    }
    const detected = this.storage.detectMimeType(
      file.buffer,
      'application/octet-stream',
    );
    if (!IMAGE_TYPES.has(detected)) {
      throw new BadRequestException({
        code: 'BRANDING_LOGO_TYPE_INVALID',
        message: 'Company logo must be PNG, JPEG or WebP',
      });
    }
    const dimensions = imageDimensions(file.buffer, detected);
    if (
      !dimensions ||
      dimensions.width < 16 ||
      dimensions.height < 16 ||
      dimensions.width > BRANDING_LOGO_MAX_DIMENSION ||
      dimensions.height > BRANDING_LOGO_MAX_DIMENSION
    ) {
      throw new BadRequestException({
        code: 'BRANDING_LOGO_DIMENSIONS_INVALID',
        message: 'Company logo dimensions must be between 16 and 4096 pixels',
      });
    }
    const extension =
      detected === 'image/png'
        ? '.png'
        : detected === 'image/webp'
          ? '.webp'
          : '.jpg';
    const stored = await this.storage.saveBuffer(
      user.organizationId,
      'branding',
      `company-logo${extension}`,
      detected,
      file.buffer,
    );
    let previousKey: string | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const previous = await tx.organizationBrandingLogo.findUnique({
          where: { organizationId: user.organizationId },
          include: { file: true },
        });
        previousKey = previous?.file.storageKey;
        const asset = await tx.fileAsset.create({
          data: {
            organizationId: user.organizationId,
            storageKey: stored.storageKey,
            originalName: `company-logo${extension}`,
            mimeType: detected,
            size: stored.size,
            checksum: stored.checksum,
            category: 'ORGANIZATION_BRANDING_LOGO',
            uploadedBy: user.id,
          },
        });
        await tx.organizationBrandingLogo.upsert({
          where: { organizationId: user.organizationId },
          update: { fileId: asset.id, updatedBy: user.id },
          create: {
            organizationId: user.organizationId,
            fileId: asset.id,
            updatedBy: user.id,
          },
        });
        if (previous) {
          await tx.fileAsset.delete({ where: { id: previous.fileId } });
        }
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey);
      throw error;
    }
    if (previousKey) await this.storage.delete(previousKey);
    await this.auditBranding(user, 'branding.logo.replaced', {
      logoChanged: true,
      mimeType: detected,
      width: dimensions.width,
      height: dimensions.height,
    });
    return this.get(user);
  }

  async removeBrandingLogo(user: AuthenticatedUser) {
    const existing = await this.prisma.organizationBrandingLogo.findUnique({
      where: { organizationId: user.organizationId },
      include: { file: true },
    });
    if (!existing) return this.get(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationBrandingLogo.delete({
        where: { organizationId: user.organizationId },
      });
      await tx.fileAsset.delete({ where: { id: existing.fileId } });
    });
    await this.storage.delete(existing.file.storageKey);
    await this.auditBranding(user, 'branding.logo.removed', {
      logoChanged: true,
    });
    return this.get(user);
  }

  async brandingLogo(user: AuthenticatedUser) {
    const branding = await this.prisma.organizationBrandingLogo.findUnique({
      where: { organizationId: user.organizationId },
      include: { file: true },
    });
    if (!branding) throw new NotFoundException('Company logo not found');
    if (
      !(await this.storage.verify(
        branding.file.storageKey,
        branding.file.checksum,
      ))
    ) {
      throw new BadRequestException({
        code: 'BRANDING_LOGO_INTEGRITY_FAILED',
        message: 'Company logo integrity verification failed',
      });
    }
    return {
      stream: this.storage.getReadStream(branding.file.storageKey),
      mimeType: branding.file.mimeType,
      size: Number(branding.file.size),
    };
  }

  private async auditBranding(
    user: AuthenticatedUser,
    action: string,
    summary: Prisma.InputJsonObject,
  ) {
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        action,
        entityType: 'OrganizationBranding',
        entityId: user.organizationId,
        newValues: summary,
      },
    });
  }

  async uploadAvatar(user: AuthenticatedUser, file: UploadedBufferFile) {
    if (!file?.buffer || file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Avatar image is required and must not exceed 5 MB',
      );
    }
    const detected = this.storage.detectMimeType(
      file.buffer,
      'application/octet-stream',
    );
    if (!IMAGE_TYPES.has(detected))
      throw new BadRequestException('Unsupported avatar image');
    const stored = await this.storage.saveBuffer(
      user.organizationId,
      'avatars',
      file.originalname,
      detected,
      file.buffer,
    );
    let previousKey: string | undefined;
    try {
      await this.prisma.$transaction(async (tx) => {
        const previous = await tx.userAvatar.findUnique({
          where: { userId: user.id },
          include: { file: true },
        });
        previousKey = previous?.file.storageKey;
        const asset = await tx.fileAsset.create({
          data: {
            organizationId: user.organizationId,
            storageKey: stored.storageKey,
            originalName: stored.originalName,
            mimeType: detected,
            size: stored.size,
            checksum: stored.checksum,
            category: 'USER_AVATAR',
            uploadedBy: user.id,
          },
        });
        await tx.userAvatar.upsert({
          where: { userId: user.id },
          update: { fileId: asset.id, organizationId: user.organizationId },
          create: {
            userId: user.id,
            organizationId: user.organizationId,
            fileId: asset.id,
          },
        });
        if (previous)
          await tx.fileAsset.delete({ where: { id: previous.fileId } });
      });
    } catch (error) {
      await this.storage.delete(stored.storageKey);
      throw error;
    }
    if (previousKey) await this.storage.delete(previousKey);
    return this.get(user);
  }

  async removeAvatar(user: AuthenticatedUser) {
    const existing = await this.prisma.userAvatar.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      include: { file: true },
    });
    if (!existing) return this.get(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.userAvatar.delete({ where: { userId: user.id } });
      await tx.fileAsset.delete({ where: { id: existing.fileId } });
    });
    await this.storage.delete(existing.file.storageKey);
    return this.get(user);
  }

  async avatar(user: AuthenticatedUser) {
    const avatar = await this.prisma.userAvatar.findFirst({
      where: { userId: user.id, organizationId: user.organizationId },
      include: { file: true },
    });
    if (!avatar) throw new NotFoundException('Avatar not found');
    return {
      stream: this.storage.getReadStream(avatar.file.storageKey),
      mimeType: avatar.file.mimeType,
      size: Number(avatar.file.size),
    };
  }
}

function imageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  if (mimeType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > buffer.length) return null;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += length + 2;
    }
  }
  if (mimeType === 'image/webp' && buffer.length >= 30) {
    const kind = buffer.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8 ' && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (kind === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      return {
        width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
        height:
          1 +
          (buffer[22] >> 6) +
          (buffer[23] << 2) +
          ((buffer[24] & 0x0f) << 10),
      };
    }
  }
  return null;
}
