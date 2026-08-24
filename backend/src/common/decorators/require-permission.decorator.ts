import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Permission } from '@auto-import/contracts';

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: Permission) =>
  applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    ApiBearerAuth('access-token'),
  );
