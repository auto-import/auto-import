import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';

describe('JwtStrategy (Requirement 14: Disabled & Deleted User Token Security)', () => {
  let strategy: JwtStrategy;
  let getCurrentUser: jest.MockedFunction<AuthService['getCurrentUser']>;

  beforeEach(async () => {
    getCurrentUser = jest.fn<
      ReturnType<AuthService['getCurrentUser']>,
      Parameters<AuthService['getCurrentUser']>
    >();

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
          provide: AuthService,
          useValue: { getCurrentUser },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('should accept token for an active user with an active organization', async () => {
    getCurrentUser.mockResolvedValue({
      id: 'user-1',
      email: 'active@example.com',
      organizationId: 'org-1',
      firstName: 'Active',
      lastName: 'User',
      office: null,
      roles: [{ id: 'role-1', name: 'Commercial', scope: 'tenant' }],
      permissions: ['dossiers:read'],
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
    expect(result.roles[0]?.name).toBe('Commercial');
    expect(result.permissions).toContain('dossiers:read');
  });

  it('should reject token if user has been disabled (status !== active)', async () => {
    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Account is inactive'),
    );

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
    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Invalid session'),
    );

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
    getCurrentUser.mockRejectedValue(
      new UnauthorizedException('Organization is inactive'),
    );

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
