import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy (Requirement 14: Disabled & Deleted User Token Security)', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should accept token for an active user with an active organization', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'active@example.com',
      organizationId: 'org-1',
      firstName: 'Active',
      lastName: 'User',
      status: 'active',
      organization: {
        id: 'org-1',
        status: 'active',
      },
      userRoles: [
        {
          role: {
            name: 'Commercial',
            rolePermissions: [
              { permission: { resource: 'dossiers', action: 'read' } },
            ],
          },
        },
      ],
    });

    const payload = {
      sub: 'user-1',
      email: 'active@example.com',
      organizationId: 'org-1',
    };

    const result = await strategy.validate(payload);
    expect(result).toBeDefined();
    expect(result.id).toBe('user-1');
    expect(result.organizationId).toBe('org-1');
    expect(result.roles).toContain('Commercial');
    expect(result.permissions).toContain('dossiers:read');
  });

  it('should reject token if user has been disabled (status !== active)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'disabled@example.com',
      organizationId: 'org-1',
      status: 'inactive',
      organization: {
        id: 'org-1',
        status: 'active',
      },
      userRoles: [],
    });

    const payload = {
      sub: 'user-1',
      email: 'disabled@example.com',
      organizationId: 'org-1',
    };

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject token if user has been deleted from database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const payload = {
      sub: 'deleted-user',
      email: 'deleted@example.com',
      organizationId: 'org-1',
    };

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject token if user organization is inactive/suspended', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      organizationId: 'org-1',
      status: 'active',
      organization: {
        id: 'org-1',
        status: 'suspended',
      },
      userRoles: [],
    });

    const payload = {
      sub: 'user-1',
      email: 'user@example.com',
      organizationId: 'org-1',
    };

    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
