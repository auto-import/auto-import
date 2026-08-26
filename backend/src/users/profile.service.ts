import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProvider } from '../documents/storage.provider';
import type { UploadedBufferFile } from '../documents/documents.service';
import type { AuthenticatedUser } from '../auth/auth.types';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
        office: { select: { id: true, name: true, city: true } },
        organization: { select: { id: true, name: true } },
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
    };
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
