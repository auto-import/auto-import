import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  async create(
    createRoleDto: CreateRoleDto,
    organizationId: string,
    caller: AuthenticatedUser,
  ) {
    const { permissionIds, ...roleData } = createRoleDto;
    const role = await this.prisma.$transaction(
      async (transaction) => {
        const existingRole = await transaction.role.findFirst({
          where: { name: roleData.name, organizationId },
          select: { id: true },
        });
        if (existingRole) {
          throw new ConflictException(
            `Role "${roleData.name}" already exists in this organization`,
          );
        }
        const validatedPermissionIds = await this.validatePermissions(
          transaction,
          permissionIds,
          caller,
        );
        return transaction.role.create({
          data: {
            ...roleData,
            organizationId,
            scope: 'tenant',
            rolePermissions: validatedPermissionIds.length
              ? {
                  create: validatedPermissionIds.map((permissionId) => ({
                    permissionId,
                  })),
                }
              : undefined,
          },
          include: {
            rolePermissions: { include: { permission: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(`Role created: ${role.name} (${role.id})`);
    return role;
  }

  async findAll(organizationId: string) {
    return this.prisma.role.findMany({
      where: { organizationId, scope: 'tenant' },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async findOne(id: string, organizationId: string) {
    const role = await this.prisma.role.findFirst({
      where: {
        id,
        organizationId,
        scope: 'tenant',
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async update(
    id: string,
    organizationId: string,
    updateRoleDto: UpdateRoleDto,
    caller: AuthenticatedUser,
  ) {
    const { permissionIds, ...roleData } = updateRoleDto;
    const role = await this.prisma.$transaction(
      async (transaction) => {
        const existingRole = await transaction.role.findFirst({
          where: { id, organizationId, scope: 'tenant' },
          select: { id: true },
        });
        if (!existingRole) throw new NotFoundException('Role not found');
        const validatedPermissionIds = await this.validatePermissions(
          transaction,
          permissionIds,
          caller,
        );
        return transaction.role.update({
          where: { id },
          data: {
            ...roleData,
            ...(permissionIds && {
              rolePermissions: {
                deleteMany: {},
                create: validatedPermissionIds.map((permissionId) => ({
                  permissionId,
                })),
              },
            }),
          },
          include: {
            rolePermissions: { include: { permission: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    this.logger.log(`Role updated: ${role.name} (${role.id})`);
    return role;
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);

    // Check if role is assigned to users
    const userCount = await this.prisma.userRole.count({
      where: { roleId: id },
    });

    if (userCount > 0) {
      throw new ConflictException(
        `Cannot delete role: ${userCount} users have this role`,
      );
    }

    await this.prisma.role.delete({
      where: { id },
    });

    this.logger.log(`Role deleted: ${id}`);
    return { message: 'Role deleted successfully' };
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  private async validatePermissions(
    transaction: Prisma.TransactionClient,
    permissionIds: string[] | undefined,
    caller: AuthenticatedUser,
  ): Promise<string[]> {
    if (!permissionIds) return [];
    const uniquePermissionIds = [...new Set(permissionIds)];
    const permissions = await transaction.permission.findMany({
      where: { id: { in: uniquePermissionIds } },
    });
    if (permissions.length !== uniquePermissionIds.length) {
      throw new NotFoundException('Permission not found');
    }
    const callerPermissions = new Set<string>(caller.permissions);
    if (
      permissions.some(
        (permission) =>
          !callerPermissions.has(`${permission.resource}:${permission.action}`),
      )
    ) {
      throw new ForbiddenException('Cannot grant privileges you do not hold');
    }
    return uniquePermissionIds;
  }
}
