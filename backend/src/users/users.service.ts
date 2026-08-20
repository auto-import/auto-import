import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto, organizationId: string) {
    const { email, password, roleIds, ...userData } = createUserDto;

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Verify roleIds belong to the organization or are platform roles
    if (roleIds && roleIds.length > 0) {
      const validRoles = await this.prisma.role.findMany({
        where: {
          id: { in: roleIds },
          OR: [
            { organizationId },
            { organizationId: null },
          ],
        },
      });

      if (validRoles.length !== roleIds.length) {
        throw new ForbiddenException('One or more role IDs are invalid for this organization');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        ...userData,
        email,
        passwordHash,
        organizationId,
        userRoles: roleIds ? {
          create: roleIds.map(roleId => ({ roleId })),
        } : undefined,
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        office: true,
      },
    });

    this.logger.log(`User created: ${user.email} (${user.id})`);
    return user;
  }

  async findAll(organizationId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId },
        skip,
        take: limit,
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          office: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: { organizationId },
      }),
    ]);

    return {
      items: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, organizationId: string) {
    const user = await this.prisma.user.findFirst({
      where: { 
        id, 
        organizationId 
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        office: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, organizationId: string, updateUserDto: UpdateUserDto, currentUserId?: string) {
    const { roleIds, ...userData } = updateUserDto;

    // Check if user exists
    const targetUser = await this.findOne(id, organizationId);

    // Verify roleIds belong to the organization
    if (roleIds && roleIds.length > 0) {
      const validRoles = await this.prisma.role.findMany({
        where: {
          id: { in: roleIds },
          OR: [
            { organizationId },
            { organizationId: null },
          ],
        },
      });

      if (validRoles.length !== roleIds.length) {
        throw new ForbiddenException('One or more role IDs are invalid for this organization');
      }
    }

    // Update user
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...userData,
        ...(roleIds && {
          userRoles: {
            deleteMany: {},
            create: roleIds.map(roleId => ({ roleId })),
          },
        }),
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        office: true,
      },
    });

    this.logger.log(`User updated: ${user.email} (${user.id})`);
    return user;
  }

  async remove(id: string, organizationId: string, currentUserId?: string) {
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findOne(id, organizationId);

    // Check if user is the last active admin/Direction user in the organization
    const isAdmin = user.userRoles.some(ur => 
      ur.role.name.toLowerCase() === 'admin' || 
      ur.role.name.toLowerCase() === 'direction'
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
        throw new ConflictException('Cannot delete the last administrator of the organization');
      }
    }

    await this.prisma.user.delete({
      where: { id },
    });

    this.logger.log(`User deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }

  async updatePassword(id: string, organizationId: string, newPassword: string) {
    await this.findOne(id, organizationId);

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    this.logger.log(`Password updated for user: ${id}`);
    return { message: 'Password updated successfully' };
  }
}
