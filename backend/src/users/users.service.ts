import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Permission } from '@auto-import/contracts';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { paginate } from '../common/helpers/pagination.helper';
import type { AuthenticatedUser } from '../auth/auth.types';
import { FilterUsersDto } from './dto/filter-users.dto';

const PUBLIC_USER_SELECT = {
  id: true,
  organizationId: true,
  officeId: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  office: { select: { id: true, name: true, city: true, status: true } },
  userRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          scope: true,
          organizationId: true,
          rolePermissions: {
            select: { permission: true },
          },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async create(
    createUserDto: CreateUserDto,
    organizationId: string,
    caller: AuthenticatedUser,
  ) {
    const { email, password, roleIds, ...userData } = createUserDto;
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.prisma.$transaction(
        async (transaction) => {
          const existingUser = await transaction.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          });
          if (existingUser) {
            throw new ConflictException('User with this email already exists');
          }
          await this.validateTenantAssignments(
            transaction,
            organizationId,
            userData.officeId,
            roleIds,
            caller,
          );
          return transaction.user.create({
            data: {
              ...userData,
              email: normalizedEmail,
              passwordHash,
              organizationId,
              userRoles: roleIds?.length
                ? { create: roleIds.map((roleId) => ({ roleId })) }
                : undefined,
            },
            select: PUBLIC_USER_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      this.logger.log(`User created: ${user.email} (${user.id})`);
      return user;
    } catch (error: unknown) {
      this.rethrowEmailConflict(error);
    }
  }

  async findAll(organizationId: string, filters: FilterUsersDto = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.officeId ? { officeId: filters.officeId } : {}),
      ...(filters.roleId
        ? { userRoles: { some: { roleId: filters.roleId } } }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: PUBLIC_USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where,
      }),
    ]);

    return paginate(users, total, page, limit);
  }

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        organizationId,
      },
      select: PUBLIC_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(
    id: string,
    organizationId: string,
    updateUserDto: UpdateUserDto,
    caller: AuthenticatedUser,
  ) {
    const { roleIds, ...userData } = updateUserDto;
    try {
      const user = await this.prisma.$transaction(
        async (transaction) => {
          const target = await transaction.user.findFirst({
            where: { id, organizationId },
            select: { id: true },
          });
          if (!target) throw new NotFoundException('User not found');
          await this.validateTenantAssignments(
            transaction,
            organizationId,
            userData.officeId,
            roleIds,
            caller,
          );
          if (userData.email) {
            userData.email = userData.email.trim().toLowerCase();
          }
          return transaction.user.update({
            where: { id },
            data: {
              ...userData,
              ...(roleIds && {
                userRoles: {
                  deleteMany: {},
                  create: roleIds.map((roleId) => ({ roleId })),
                },
              }),
            },
            select: PUBLIC_USER_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      this.logger.log(`User updated: ${user.email} (${user.id})`);
      return user;
    } catch (error: unknown) {
      this.rethrowEmailConflict(error);
    }
  }

  async remove(id: string, organizationId: string, currentUserId?: string) {
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findOne(id, organizationId);

    // Check if user is an active admin/Direction user or holds users:manage in the organization
    const isAdmin = user.userRoles.some(
      (ur) =>
        ur.role.name.toLowerCase() === 'admin' ||
        ur.role.name.toLowerCase() === 'direction' ||
        ur.role.rolePermissions?.some(
          (rp) =>
            rp.permission?.resource === 'users' &&
            rp.permission?.action === 'manage',
        ),
    );

    if (isAdmin) {
      const adminUsersCount = await this.prisma.userRole.count({
        where: {
          user: { organizationId, status: 'active', id: { not: id } },
          role: {
            name: { in: ['Admin', 'admin', 'Direction', 'direction'] },
          },
        },
      });

      if (adminUsersCount === 0) {
        throw new ConflictException(
          'Cannot delete the last administrator of the organization',
        );
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }

  async updatePassword(
    id: string,
    organizationId: string,
    newPassword: string,
  ) {
    await this.findOne(id, organizationId);

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    this.logger.log(`Password updated for user: ${id}`);
    return { message: 'Password updated successfully' };
  }

  private async validateTenantAssignments(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    officeId: string | null | undefined,
    roleIds: string[] | undefined,
    caller: AuthenticatedUser,
  ): Promise<void> {
    if (officeId) {
      const office = await transaction.office.findFirst({
        where: { id: officeId, organizationId },
        select: { id: true },
      });
      if (!office) throw new NotFoundException('Office not found');
    }
    if (!roleIds) return;
    if (!caller.permissions.includes(Permission.USERS_MANAGE)) {
      throw new ForbiddenException('Role assignment requires user management');
    }
    const uniqueRoleIds = [...new Set(roleIds)];
    const roles = await transaction.role.findMany({
      where: {
        id: { in: uniqueRoleIds },
        organizationId,
        scope: 'tenant',
      },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });
    if (roles.length !== uniqueRoleIds.length) {
      throw new ForbiddenException('One or more roles cannot be assigned');
    }
    const callerPermissions = new Set<string>(caller.permissions);
    const escalates = roles.some((role) =>
      role.rolePermissions.some(
        ({ permission }) =>
          !callerPermissions.has(`${permission.resource}:${permission.action}`),
      ),
    );
    if (escalates) {
      throw new ForbiddenException('Cannot grant privileges you do not hold');
    }
  }

  private rethrowEmailConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('User with this email already exists');
    }
    throw error;
  }
}
