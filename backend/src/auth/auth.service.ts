import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
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
      },
    });

    if (!user) {
      this.logger.warn(`Login attempt failed: User not found - ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Login attempt failed: Invalid password - ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      this.logger.warn(`Login attempt failed: User inactive - ${email}`);
      throw new UnauthorizedException('Account is inactive');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async login(user: any) {
    const permissions = user.userRoles.flatMap(ur =>
      ur.role.rolePermissions.map(rp => `${rp.permission.resource}:${rp.permission.action}`)
    );

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.userRoles.map(ur => ur.role.name),
      permissions: [...new Set(permissions)],
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_TTL', '7d'),
      }
    );

    this.logger.log(`User logged in: ${user.email} (${user.id})`);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: payload.roles,
        permissions: payload.permissions,
        organizationId: user.organizationId,
      },
    };
  }

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is inactive');
    }

    const permissions = user.userRoles.flatMap(ur =>
      ur.role.rolePermissions.map(rp => `${rp.permission.resource}:${rp.permission.action}`)
    );

    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.userRoles.map(ur => ur.role.name),
      permissions: [...new Set(permissions)],
    };

    const accessToken = this.jwtService.sign(payload);
    this.logger.log(`Token refreshed for user: ${user.email}`);

    return { accessToken };
  }

  async logout(userId: string) {
    this.logger.log(`User logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }
}
