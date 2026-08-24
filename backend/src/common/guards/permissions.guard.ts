import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { Permission } from '@auto-import/contracts';
import type { AuthenticatedUser } from '../../auth/auth.types';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<Permission>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.permissions.includes(requiredPermission)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
