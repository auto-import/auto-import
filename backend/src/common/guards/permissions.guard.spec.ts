import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

describe('PermissionsGuard (Phase 3-5 RBAC & Access Control)', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function createMockContext(
    user: any,
    requiredPermission?: string,
  ): ExecutionContext {
    jest.spyOn(reflector, 'get').mockReturnValue(requiredPermission);

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access if no permission is required on the route', () => {
    const context = createMockContext({ id: 'u1' }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user is not authenticated', () => {
    const context = createMockContext(null, 'dossiers:read');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow access if user has the required permission', () => {
    const context = createMockContext(
      {
        id: 'u1',
        permissions: ['dossiers:read', 'clients:read'],
      },
      'dossiers:read',
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access and throw ForbiddenException if user lacks the required permission', () => {
    const context = createMockContext(
      {
        id: 'u1',
        permissions: ['vehicles:read'],
      },
      'dossiers:write',
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      /Permission required: dossiers:write/,
    );
  });
});
