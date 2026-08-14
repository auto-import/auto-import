import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto, organizationId: string) {
    const { permissionIds, ...roleData } = createRoleDto;

    // Check if role exists
    const existingRole = await this.prisma.role.findFirst({
      where: {
        name: roleData.name,
        organizationId,
      },
    });

    if (existingRole) {
      throw new ConflictException(`Role "${roleData.name}" already exists in this organization`);
    }

    const role = await this.prisma.role.create({
      data: {
        ...roleData,
        organizationId,
        scope: roleData.scope || 'tenant',
        rolePermissions: permissionIds ? {
          create: permissionIds.map(permissionId => ({ permissionId })),
        } : undefined,
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    this.logger.log(`Role created: ${role.name} (${role.id})`);
    return role;
  }

  async findAll(organizationId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [
          { organizationId },
          { organizationId: null },
        ],
      },
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
        OR: [
          { organizationId },
          { organizationId: null },
        ],
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

  async update(id: string, organizationId: string, updateRoleDto: UpdateRoleDto) {
    const { permissionIds, ...roleData } = updateRoleDto;

    await this.findOne(id, organizationId);

    const role = await this.prisma.role.update({
      where: { id },
      data: {
        ...roleData,
        ...(permissionIds && {
          rolePermissions: {
            deleteMany: {},
            create: permissionIds.map(permissionId => ({ permissionId })),
          },
        }),
      },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

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
      throw new ConflictException(`Cannot delete role: ${userCount} users have this role`);
    }

    await this.prisma.role.delete({
      where: { id },
    });

    this.logger.log(`Role deleted: ${id}`);
    return { message: 'Role deleted successfully' };
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [
        { resource: 'asc' },
        { action: 'asc' },
      ],
    });
  }
}
